export const PORTFOLIO_COMPARISON_SNAPSHOTS_SQL = `
  WITH ranked_snapshots AS (
    SELECT
      card_id,
      recorded_at,
      tcgplayer_prices,
      cardmarket_prices,
      tcgplayer_updated_at,
      cardmarket_updated_at,
      ROW_NUMBER() OVER (
        PARTITION BY card_id
        ORDER BY recorded_at DESC, id DESC
      ) AS snapshot_rank
    FROM price_snapshots
    WHERE card_id IN (
      SELECT CAST(value AS TEXT)
      FROM json_each(?)
    )
  ),
  latest_snapshots AS (
    SELECT card_id, recorded_at
    FROM ranked_snapshots
    WHERE snapshot_rank = 1
  ),
  comparison_dates AS (
    SELECT
      latest.card_id,
      latest.recorded_at AS latest_date,
      COALESCE(
        MAX(
          CASE
            WHEN date(candidate.recorded_at) = date(latest.recorded_at, '-1 day')
            THEN candidate.recorded_at
          END
        ),
        MAX(
          CASE
            WHEN date(candidate.recorded_at) = date(latest.recorded_at, '-2 days')
            THEN candidate.recorded_at
          END
        )
      ) AS previous_date,
      COALESCE(
        MAX(
          CASE
            WHEN date(candidate.recorded_at) = date(latest.recorded_at, '-7 days')
            THEN candidate.recorded_at
          END
        ),
        MAX(
          CASE
            WHEN date(candidate.recorded_at) = date(latest.recorded_at, '-6 days')
            THEN candidate.recorded_at
          END
        ),
        MAX(
          CASE
            WHEN date(candidate.recorded_at) = date(latest.recorded_at, '-8 days')
            THEN candidate.recorded_at
          END
        )
      ) AS seven_day_date,
      COALESCE(
        MAX(
          CASE
            WHEN date(candidate.recorded_at) = date(latest.recorded_at, '-30 days')
            THEN candidate.recorded_at
          END
        ),
        MAX(
          CASE
            WHEN date(candidate.recorded_at) = date(latest.recorded_at, '-29 days')
            THEN candidate.recorded_at
          END
        ),
        MAX(
          CASE
            WHEN date(candidate.recorded_at) = date(latest.recorded_at, '-31 days')
            THEN candidate.recorded_at
          END
        )
      ) AS thirty_day_date
    FROM latest_snapshots AS latest
    LEFT JOIN ranked_snapshots AS candidate
      ON candidate.card_id = latest.card_id
    GROUP BY latest.card_id, latest.recorded_at
  ),
  selected_snapshots AS (
    SELECT
      snapshot.card_id,
      snapshot.recorded_at,
      snapshot.tcgplayer_prices,
      snapshot.cardmarket_prices,
      snapshot.tcgplayer_updated_at,
      snapshot.cardmarket_updated_at,
      'latest' AS comparison_period
    FROM comparison_dates AS dates
    JOIN ranked_snapshots AS snapshot
      ON snapshot.card_id = dates.card_id
      AND snapshot.recorded_at = dates.latest_date

    UNION ALL

    SELECT
      snapshot.card_id,
      snapshot.recorded_at,
      snapshot.tcgplayer_prices,
      snapshot.cardmarket_prices,
      snapshot.tcgplayer_updated_at,
      snapshot.cardmarket_updated_at,
      '24h' AS comparison_period
    FROM comparison_dates AS dates
    JOIN ranked_snapshots AS snapshot
      ON snapshot.card_id = dates.card_id
      AND snapshot.recorded_at = dates.previous_date

    UNION ALL

    SELECT
      snapshot.card_id,
      snapshot.recorded_at,
      snapshot.tcgplayer_prices,
      snapshot.cardmarket_prices,
      snapshot.tcgplayer_updated_at,
      snapshot.cardmarket_updated_at,
      '7d' AS comparison_period
    FROM comparison_dates AS dates
    JOIN ranked_snapshots AS snapshot
      ON snapshot.card_id = dates.card_id
      AND snapshot.recorded_at = dates.seven_day_date

    UNION ALL

    SELECT
      snapshot.card_id,
      snapshot.recorded_at,
      snapshot.tcgplayer_prices,
      snapshot.cardmarket_prices,
      snapshot.tcgplayer_updated_at,
      snapshot.cardmarket_updated_at,
      '30d' AS comparison_period
    FROM comparison_dates AS dates
    JOIN ranked_snapshots AS snapshot
      ON snapshot.card_id = dates.card_id
      AND snapshot.recorded_at = dates.thirty_day_date
  )
  SELECT
    card_id,
    recorded_at,
    tcgplayer_prices,
    cardmarket_prices,
    tcgplayer_updated_at,
    cardmarket_updated_at,
    comparison_period
  FROM selected_snapshots
`;

export type PortfolioComparisonPeriod = "latest" | "24h" | "7d" | "30d";

export type PortfolioPriceSnapshotRow = {
  card_id: string;
  recorded_at: string;
  tcgplayer_prices: string | null;
  cardmarket_prices: string | null;
  tcgplayer_updated_at: string | null;
  cardmarket_updated_at: string | null;
  comparison_period: PortfolioComparisonPeriod;
};

export type PortfolioPriceSnapshot = {
  recordedAt: string;
  tcgplayerPrices: Record<string, unknown> | null;
  cardmarketPrices: Record<string, unknown> | null;
  tcgplayerUpdatedAt: string | null;
  cardmarketUpdatedAt: string | null;
};

function parsePriceObject(
  value: string | null,
  cardId: string,
  provider: "tcgplayer" | "cardmarket",
) {
  if (value === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `Portfolio snapshot for ${cardId} contains invalid ${provider} JSON`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Portfolio snapshot for ${cardId} contains invalid ${provider} prices`,
    );
  }

  return parsed as Record<string, unknown>;
}

export function parsePortfolioPriceSnapshot(
  row: PortfolioPriceSnapshotRow,
): PortfolioPriceSnapshot {
  const cardId = String(row.card_id);
  return {
    recordedAt: String(row.recorded_at),
    tcgplayerPrices: parsePriceObject(
      row.tcgplayer_prices,
      cardId,
      "tcgplayer",
    ),
    cardmarketPrices: parsePriceObject(
      row.cardmarket_prices,
      cardId,
      "cardmarket",
    ),
    tcgplayerUpdatedAt:
      row.tcgplayer_updated_at === null
        ? null
        : String(row.tcgplayer_updated_at),
    cardmarketUpdatedAt:
      row.cardmarket_updated_at === null
        ? null
        : String(row.cardmarket_updated_at),
  };
}
