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

function salesLeader(row: Record<string, unknown> | undefined) {
  const cardId = row?.total_leader_id;
  return typeof cardId === "string" && cardId ? { cardId } : null;
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
          (${totalSales}) AS total_sales
        FROM poketrace_cards AS cards
        WHERE cards.set_name = ? COLLATE NOCASE
      )
      SELECT
        id AS total_leader_id
      FROM set_sales
      WHERE has_sales_data = 1
      ORDER BY total_sales DESC, id
      LIMIT 1
    `,
    args: [setName.trim()],
  });
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return {
    total: salesLeader(row),
  };
}
