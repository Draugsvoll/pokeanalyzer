import type { Client } from "@libsql/client";
import { POKETRACE_RAW_CONDITIONS } from "../../shared/pokeTraceMarketConditions.js";
import type { PokeTraceSetSalesLeaders } from "../../shared/pokeTraceSet.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";

type InsightsDatabase = Pick<Client, "execute">;

type InsightsDependencies = {
  database: InsightsDatabase;
  ensureReady: () => Promise<void>;
};

const totalSales = POKETRACE_RAW_CONDITIONS.map(
  (condition) => `CASE
    WHEN json_type(cards.raw_json, '$.prices.tcgplayer.${condition}.saleCount')
           IN ('integer', 'real')
    THEN CAST(
      json_extract(
        cards.raw_json,
        '$.prices.tcgplayer.${condition}.saleCount'
      ) AS REAL
    )
    ELSE 0
  END`,
).join(" + ");

const hasSalesData = POKETRACE_RAW_CONDITIONS.map(
  (condition) => `json_type(
    cards.raw_json,
    '$.prices.tcgplayer.${condition}.saleCount'
  ) IN ('integer', 'real')`,
).join(" OR ");

const hasApproximateSales = POKETRACE_RAW_CONDITIONS.map(
  (condition) => `(
    json_type(cards.raw_json, '$.prices.tcgplayer.${condition}.saleCount')
      IN ('integer', 'real')
    AND COALESCE(
      json_extract(
        cards.raw_json,
        '$.prices.tcgplayer.${condition}.approxSaleCount'
      ),
      0
    ) = 1
  )`,
).join(" OR ");

function salesLeader(
  row: Record<string, unknown> | undefined,
  prefix: "least_total" | "total",
) {
  const cardId = row?.[`${prefix}_leader_id`];
  const sales = Number(row?.[`${prefix}_leader_sales`]);
  if (
    typeof cardId !== "string" ||
    !cardId ||
    !Number.isFinite(sales) ||
    sales < 0
  ) {
    return null;
  }
  return {
    approximate: Number(row?.[`${prefix}_leader_approximate`] ?? 0) === 1,
    cardId,
    sales,
  };
}

export async function loadPokeTraceSetSalesLeaders(
  setName: string,
  dependencies: Partial<InsightsDependencies> = {},
): Promise<PokeTraceSetSalesLeaders> {
  const database = dependencies.database ?? pokeTraceDb;
  const ensureReady = dependencies.ensureReady ?? ensurePokeTraceReady;
  await ensureReady();

  const result = await database.execute({
    sql: `
      WITH set_sales AS (
        SELECT
          cards.id,
          CASE WHEN ${hasSalesData} THEN 1 ELSE 0 END AS has_sales_data,
          CASE WHEN ${hasApproximateSales} THEN 1 ELSE 0 END AS approximate,
          (${totalSales}) AS total_sales
        FROM poketrace_cards AS cards
        WHERE cards.set_name = ? COLLATE NOCASE
      )
      SELECT
        (
          SELECT id
          FROM set_sales
          WHERE has_sales_data = 1
          ORDER BY total_sales DESC, id
          LIMIT 1
        ) AS total_leader_id,
        (
          SELECT total_sales
          FROM set_sales
          WHERE has_sales_data = 1
          ORDER BY total_sales DESC, id
          LIMIT 1
        ) AS total_leader_sales,
        (
          SELECT approximate
          FROM set_sales
          WHERE has_sales_data = 1
          ORDER BY total_sales DESC, id
          LIMIT 1
        ) AS total_leader_approximate,
        (
          SELECT id
          FROM set_sales
          WHERE has_sales_data = 1 AND total_sales > 0
          ORDER BY total_sales, id
          LIMIT 1
        ) AS least_total_leader_id,
        (
          SELECT total_sales
          FROM set_sales
          WHERE has_sales_data = 1 AND total_sales > 0
          ORDER BY total_sales, id
          LIMIT 1
        ) AS least_total_leader_sales,
        (
          SELECT approximate
          FROM set_sales
          WHERE has_sales_data = 1 AND total_sales > 0
          ORDER BY total_sales, id
          LIMIT 1
        ) AS least_total_leader_approximate
    `,
    args: [setName.trim()],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return {
    leastTotal: salesLeader(row, "least_total"),
    total: salesLeader(row, "total"),
  };
}
