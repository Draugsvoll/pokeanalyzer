import type { Client } from "@libsql/client";
import type {
  MarketSummaryPayload,
  MarketSummaryResponse,
} from "../../src/types/news.js";
import { parseMarketSummaryResponse } from "../scripts/marketSummaryGeneration.js";
import { db, dbAll, dbExecute } from "./db.js";
import { findMissingColumns } from "./schemaValidationPolicy.js";

type MarketSummaryRow = {
  [key: string]: unknown;
  payload_json: unknown;
};

type TableInfoRow = {
  [key: string]: unknown;
  name: unknown;
};

const REQUIRED_MARKET_SUMMARY_COLUMNS = [
  "id",
  "payload_json",
  "generated_at",
  "updated_at",
] as const;

export const MARKET_SUMMARY_UPSERT_SQL = `
  INSERT INTO market_summary_content (
    id,
    payload_json,
    generated_at,
    updated_at
  )
  VALUES (1, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    payload_json = excluded.payload_json,
    generated_at = excluded.generated_at,
    updated_at = CURRENT_TIMESTAMP
`;

export async function assertMarketSummarySchemaCompatible(
  database: Pick<Client, "execute"> = db,
): Promise<void> {
  const result = await database.execute(
    'PRAGMA table_info("market_summary_content")',
  );
  const rows = result.rows as unknown as TableInfoRow[];
  if (rows.length === 0) {
    throw new Error(
      "Database schema is incompatible: market_summary_content table is missing. Run npm run db:init before generating a market summary.",
    );
  }

  const missingColumns = findMissingColumns(
    rows.map((row) => String(row.name)),
    REQUIRED_MARKET_SUMMARY_COLUMNS,
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `Database schema is incompatible: market_summary_content is missing ${missingColumns.join(", ")}. Run npm run db:init or migrate the existing table.`,
    );
  }
}

export async function saveMarketSummary(
  payload: MarketSummaryPayload,
): Promise<void> {
  await dbExecute(MARKET_SUMMARY_UPSERT_SQL, [
    JSON.stringify(payload),
    payload.generatedAt || null,
  ]);
}

export function parseStoredMarketSummaryRows(
  rows: MarketSummaryRow[],
): MarketSummaryResponse {
  if (rows.length === 0) return { marketSummary: null };
  if (rows.length > 1) {
    throw new Error("Duplicate stored market summaries");
  }

  const payload = rows[0]?.payload_json;
  if (typeof payload !== "string") {
    throw new Error("Stored market summary payload must be JSON text");
  }

  return { marketSummary: parseMarketSummaryResponse(payload) };
}

export async function getMarketSummary(): Promise<MarketSummaryResponse> {
  const rows = await dbAll<MarketSummaryRow>(`
    SELECT payload_json
    FROM market_summary_content
    WHERE id = 1
  `);

  return parseStoredMarketSummaryRows(rows);
}
