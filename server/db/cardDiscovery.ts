import { TCG_PLAYER_VARIANT_ORDER } from "../../shared/tcgPlayerVariants.js";
import { parsePublicStoredCard } from "./cardSerialization.js";
import { dbAll, type SqlValue } from "./db.js";

type CardRow = {
  raw_json: string;
};

type CardQuery = (sql: string, args?: SqlValue[]) => Promise<CardRow[]>;

const NEW_RELEASE_WINDOW_MONTHS = 12;

const variantOrderSql = TCG_PLAYER_VARIANT_ORDER.map(
  (key, index) => `WHEN '${key}' THEN ${index}`,
).join("\n            ");

export const MOST_EXPENSIVE_NEW_RELEASES_SQL = `
  WITH recent_cards AS (
    SELECT
      cards.raw_json,
      (
        SELECT CAST(json_extract(variant.value, '$.market') AS REAL)
        FROM json_each(cards.raw_json, '$.tcgplayer.prices') AS variant
        WHERE json_type(variant.value, '$.market') IN ('integer', 'real')
          AND CAST(json_extract(variant.value, '$.market') AS REAL) > 0
        ORDER BY
          CASE variant.key
            ${variantOrderSql}
            ELSE 100
          END,
          variant.key
        LIMIT 1
      ) AS market_price
    FROM cards
    WHERE date(replace(json_extract(raw_json, '$.set.releaseDate'), '/', '-'))
      BETWEEN date('now', '-${NEW_RELEASE_WINDOW_MONTHS} months') AND date('now')
  )
  SELECT raw_json
  FROM recent_cards
  WHERE market_price IS NOT NULL
  ORDER BY market_price DESC
  LIMIT ?
`;

export async function getMostExpensiveNewReleases(
  limit = 12,
  query: CardQuery = dbAll,
) {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit)));
  const rows = await query(MOST_EXPENSIVE_NEW_RELEASES_SQL, [safeLimit]);

  return rows
    .map((row) => parsePublicStoredCard(String(row.raw_json)))
    .slice(0, safeLimit);
}
