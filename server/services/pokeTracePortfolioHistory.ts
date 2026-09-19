import type { Client } from "@libsql/client";

export type PokeTracePortfolioPeriod = "1d" | "7d" | "30d";

export type PokeTracePortfolioSnapshot = {
  recordedAt: string;
  marketPrice: number;
  sourceUpdatedAt: string | null;
};

type SnapshotRow = {
  card_id: unknown;
  recorded_at: unknown;
  market_price: unknown;
  source_updated_at: unknown;
  comparison_period: unknown;
};

export async function loadPokeTracePortfolioHistory(
  database: Pick<Client, "execute">,
  cardIds: string[],
) {
  const snapshotsByCardId = new Map<
    string,
    Partial<Record<PokeTracePortfolioPeriod, PokeTracePortfolioSnapshot>>
  >();
  if (cardIds.length === 0) return snapshotsByCardId;

  const placeholders = cardIds.map(() => "?").join(", ");
  const result = await database.execute({
    sql: `
      WITH latest_dates AS (
        SELECT card_id, MAX(recorded_at) AS latest_date
        FROM poketrace_tcg_market_prices
        WHERE card_id IN (${placeholders})
        GROUP BY card_id
      ),
      comparison_dates AS (
        SELECT
          latest.card_id,
          COALESCE(
            MAX(CASE
              WHEN candidate.recorded_at = date(latest.latest_date, '-1 day')
              THEN candidate.recorded_at
            END),
            MAX(CASE
              WHEN candidate.recorded_at = date(latest.latest_date, '-2 days')
              THEN candidate.recorded_at
            END),
            MAX(CASE
              WHEN candidate.recorded_at = latest.latest_date
              THEN candidate.recorded_at
            END)
          ) AS one_day_date,
          COALESCE(
            MAX(CASE
              WHEN candidate.recorded_at = date(latest.latest_date, '-7 days')
              THEN candidate.recorded_at
            END),
            MAX(CASE
              WHEN candidate.recorded_at = date(latest.latest_date, '-8 days')
              THEN candidate.recorded_at
            END),
            MAX(CASE
              WHEN candidate.recorded_at = date(latest.latest_date, '-6 days')
              THEN candidate.recorded_at
            END)
          ) AS seven_day_date,
          COALESCE(
            MAX(CASE
              WHEN candidate.recorded_at = date(latest.latest_date, '-30 days')
              THEN candidate.recorded_at
            END),
            MAX(CASE
              WHEN candidate.recorded_at = date(latest.latest_date, '-31 days')
              THEN candidate.recorded_at
            END),
            MAX(CASE
              WHEN candidate.recorded_at = date(latest.latest_date, '-29 days')
              THEN candidate.recorded_at
            END)
          ) AS thirty_day_date
        FROM latest_dates AS latest
        LEFT JOIN poketrace_tcg_market_prices AS candidate
          ON candidate.card_id = latest.card_id
        GROUP BY latest.card_id, latest.latest_date
      ),
      selected_dates AS (
        SELECT card_id, one_day_date AS recorded_at, '1d' AS comparison_period
        FROM comparison_dates
        WHERE one_day_date IS NOT NULL

        UNION ALL

        SELECT card_id, seven_day_date, '7d'
        FROM comparison_dates
        WHERE seven_day_date IS NOT NULL

        UNION ALL

        SELECT card_id, thirty_day_date, '30d'
        FROM comparison_dates
        WHERE thirty_day_date IS NOT NULL
      )
      SELECT
        prices.card_id,
        prices.recorded_at,
        prices.market_price,
        prices.source_updated_at,
        selected.comparison_period
      FROM selected_dates AS selected
      INNER JOIN poketrace_tcg_market_prices AS prices
        ON prices.card_id = selected.card_id
        AND prices.recorded_at = selected.recorded_at
      ORDER BY prices.card_id, selected.comparison_period
    `,
    args: cardIds,
  });

  for (const rawRow of result.rows) {
    const row = rawRow as unknown as SnapshotRow;
    const cardId = String(row.card_id);
    const period = String(row.comparison_period) as PokeTracePortfolioPeriod;
    const marketPrice = Number(row.market_price);
    if (
      !["1d", "7d", "30d"].includes(period) ||
      !Number.isFinite(marketPrice) ||
      marketPrice <= 0
    ) {
      continue;
    }
    const snapshots = snapshotsByCardId.get(cardId) ?? {};
    snapshots[period] = {
      recordedAt: String(row.recorded_at),
      marketPrice,
      sourceUpdatedAt:
        row.source_updated_at == null ? null : String(row.source_updated_at),
    };
    snapshotsByCardId.set(cardId, snapshots);
  }

  return snapshotsByCardId;
}
