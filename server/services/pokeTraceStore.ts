import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import type { PokeTraceCard } from "./pokeTraceApi.js";

const textOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;

const recordOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const finiteNumberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const SNAPSHOT_CONDITIONS = [
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "DAMAGED",
] as const;

function marketConditionsSnapshot(value: unknown) {
  const source = recordOrEmpty(value);
  const conditions: Record<string, Record<string, unknown>> = {};

  for (const condition of SNAPSHOT_CONDITIONS) {
    const price = recordOrEmpty(source[condition]);
    if (Object.keys(price).length > 0) conditions[condition] = price;
  }

  return Object.keys(conditions).length === 0 ? null : conditions;
}

export function cardUpsert(card: PokeTraceCard) {
  return {
    sql: `
      INSERT INTO poketrace_cards
        (id, name, card_number, set_name, rarity, variant, image_url,
         tcgplayer_id, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
        strftime('%Y-%m-%d %H:%M:%f', 'now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        card_number = excluded.card_number,
        set_name = excluded.set_name,
        rarity = excluded.rarity,
        variant = excluded.variant,
        image_url = excluded.image_url,
        tcgplayer_id = excluded.tcgplayer_id,
        raw_json = excluded.raw_json,
        fetched_at = excluded.fetched_at
    `,
    args: [
      card.id,
      card.name,
      textOrNull(card.cardNumber),
      textOrNull(card.set?.name),
      textOrNull(card.rarity),
      textOrNull(card.variant),
      textOrNull(card.image),
      card.refs?.tcgplayerId == null ? null : String(card.refs.tcgplayerId),
      JSON.stringify(card),
    ],
  };
}

export function cardRefreshSuccessUpdate(cardId: string, refreshedAt: string) {
  return {
    sql: `
      UPDATE poketrace_cards
      SET price_refreshed_at = ?,
          price_refresh_retry_at = NULL,
          price_refresh_failures = 0
      WHERE id = ?
    `,
    args: [refreshedAt, cardId],
  };
}

export function dailyMarketSnapshotUpserts(
  card: PokeTraceCard,
  recordedAt: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    throw new Error("PokeTrace snapshot date must use YYYY-MM-DD");
  }

  const prices = recordOrEmpty(card.prices);
  const tcg = marketConditionsSnapshot(prices.tcgplayer);
  const ebay = marketConditionsSnapshot(prices.ebay);
  if (tcg === null && ebay === null) return [];

  return [
    {
      sql: `
        INSERT INTO poketrace_market_snapshots
          (card_id, recorded_at, currency, tcg, ebay, source_updated_at,
           captured_at)
        VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
        ON CONFLICT(card_id, recorded_at) DO UPDATE SET
          currency = excluded.currency,
          tcg = excluded.tcg,
          ebay = excluded.ebay,
          source_updated_at = excluded.source_updated_at,
          captured_at = excluded.captured_at
      `,
      args: [
        card.id,
        recordedAt,
        textOrNull(card.currency),
        tcg === null ? null : JSON.stringify(tcg),
        ebay === null ? null : JSON.stringify(ebay),
        textOrNull(card.lastUpdated),
      ],
    },
  ];
}

export function dailyTcgMarketPriceUpserts(
  card: PokeTraceCard,
  recordedAt: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    throw new Error("PokeTrace snapshot date must use YYYY-MM-DD");
  }

  const prices = recordOrEmpty(card.prices);
  const tcgplayer = recordOrEmpty(prices.tcgplayer);
  const nearMint = recordOrEmpty(tcgplayer.NEAR_MINT);
  const marketPrice = finiteNumberOrNull(nearMint.avg);
  if (marketPrice === null) return [];

  return [
    {
      sql: `
        INSERT INTO poketrace_tcg_market_prices
          (card_id, recorded_at, market_price, currency, source_updated_at,
           captured_at)
        VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
        ON CONFLICT(card_id, recorded_at) DO UPDATE SET
          market_price = excluded.market_price,
          currency = excluded.currency,
          source_updated_at = excluded.source_updated_at,
          captured_at = excluded.captured_at
      `,
      args: [
        card.id,
        recordedAt,
        marketPrice,
        textOrNull(card.currency),
        textOrNull(card.lastUpdated),
      ],
    },
  ];
}

export function cardAndDailyPriceUpserts(
  card: PokeTraceCard,
  recordedAt: string,
  refreshedAt = new Date().toISOString(),
) {
  return [
    cardUpsert(card),
    ...dailyTcgMarketPriceUpserts(card, recordedAt),
    ...dailyMarketSnapshotUpserts(card, recordedAt),
    cardMarketComparisonsUpdate(card.id, recordedAt),
    cardRefreshSuccessUpdate(card.id, refreshedAt),
  ];
}

export function cardMarketComparisonsUpdate(
  cardId: string,
  recordedAt: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    throw new Error("PokeTrace snapshot date must use YYYY-MM-DD");
  }

  return {
    sql: `
      WITH comparison_periods(period, target_date) AS (
        VALUES
          ('1d', date(?, '-1 day')),
          ('7d', date(?, '-7 days')),
          ('30d', date(?, '-30 days'))
      ),
      ranked_snapshots AS (
        SELECT
          periods.period,
          periods.target_date,
          prices.recorded_at,
          prices.market_price,
          prices.source_updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY periods.period
            ORDER BY CASE
              WHEN prices.recorded_at = periods.target_date THEN 0
              WHEN prices.recorded_at = date(periods.target_date, '-1 day') THEN 1
              ELSE 2
            END
          ) AS priority
        FROM comparison_periods AS periods
        INNER JOIN poketrace_tcg_market_prices AS prices
          ON prices.card_id = ?
          AND prices.recorded_at IN (
            periods.target_date,
            date(periods.target_date, '-1 day'),
            date(periods.target_date, '+1 day')
          )
      )
      UPDATE poketrace_cards
      SET tcg_market_comparisons = json_object(
        'asOf', ?,
        'comparisons', json_object(
          '1d', json((
            SELECT json_object(
              'targetDate', target_date,
              'recordedAt', recorded_at,
              'marketPrice', market_price,
              'sourceUpdatedAt', source_updated_at
            )
            FROM ranked_snapshots
            WHERE period = '1d' AND priority = 1
          )),
          '7d', json((
            SELECT json_object(
              'targetDate', target_date,
              'recordedAt', recorded_at,
              'marketPrice', market_price,
              'sourceUpdatedAt', source_updated_at
            )
            FROM ranked_snapshots
            WHERE period = '7d' AND priority = 1
          )),
          '30d', json((
            SELECT json_object(
              'targetDate', target_date,
              'recordedAt', recorded_at,
              'marketPrice', market_price,
              'sourceUpdatedAt', source_updated_at
            )
            FROM ranked_snapshots
            WHERE period = '30d' AND priority = 1
          ))
        )
      )
      WHERE id = ?
    `,
    args: [recordedAt, recordedAt, recordedAt, cardId, recordedAt, cardId],
  };
}

export function cardRefreshFailureUpdate(
  cardId: string,
  previousFailures: number,
  now = Date.now(),
) {
  const failures = Math.max(0, Math.trunc(previousFailures)) + 1;
  const delayMs = Math.min(
    24 * 60 * 60 * 1000,
    15 * 60 * 1000 * 2 ** Math.min(previousFailures, 6),
  );
  return {
    sql: `
      UPDATE poketrace_cards
      SET price_refresh_failures = ?, price_refresh_retry_at = ?
      WHERE id = ?
    `,
    args: [failures, new Date(now + delayMs).toISOString(), cardId],
  };
}

export function expiredMarketSnapshotsDelete(
  recordedAt: string,
  retentionDays: number,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    throw new Error("PokeTrace snapshot date must use YYYY-MM-DD");
  }
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 31) {
    throw new Error("PokeTrace history retention must be at least 31 days");
  }
  return {
    sql: `
      DELETE FROM poketrace_market_snapshots
      WHERE recorded_at < date(?, '-' || ? || ' days')
    `,
    args: [recordedAt, retentionDays],
  };
}

export function expiredDailyPricesDelete(
  recordedAt: string,
  retentionDays: number,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    throw new Error("PokeTrace snapshot date must use YYYY-MM-DD");
  }
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 31) {
    throw new Error("PokeTrace history retention must be at least 31 days");
  }
  return {
    sql: `
      DELETE FROM poketrace_tcg_market_prices
      WHERE recorded_at < date(?, '-' || ? || ' days')
    `,
    args: [recordedAt, retentionDays],
  };
}

export async function savePokeTraceCards(cards: PokeTraceCard[]) {
  if (cards.length === 0) return;
  await ensurePokeTraceReady();
  await pokeTraceDb.batch(
    cards.map((card) => cardUpsert(card)),
    "write",
  );
}
