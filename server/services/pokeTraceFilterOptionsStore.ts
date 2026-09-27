import type { Client } from "@libsql/client";
import {
  parsePokeTraceFilterOptions,
  type PokeTraceFilterOptions,
} from "../../shared/pokeTraceFilterOptions.js";

const POKETRACE_FILTER_OPTIONS_ROW_ID = "current";

type FilterOptionsStoreDatabase = Pick<Client, "execute">;

export async function ensurePokeTraceFilterOptionsStore(
  database: FilterOptionsStoreDatabase,
) {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_filter_options (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      generated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function savePokeTraceFilterOptions(
  database: FilterOptionsStoreDatabase,
  options: PokeTraceFilterOptions,
) {
  const validated = parsePokeTraceFilterOptions(options);
  await database.execute({
    sql: `
      INSERT INTO poketrace_filter_options
        (id, payload_json, generated_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        payload_json = excluded.payload_json,
        generated_at = excluded.generated_at,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      POKETRACE_FILTER_OPTIONS_ROW_ID,
      JSON.stringify(validated),
      validated.generatedAt,
    ],
  });
}

export async function loadStoredPokeTraceFilterOptions(
  database: FilterOptionsStoreDatabase,
): Promise<PokeTraceFilterOptions | null> {
  const result = await database.execute({
    sql: `
      SELECT payload_json
      FROM poketrace_filter_options
      WHERE id = ?
    `,
    args: [POKETRACE_FILTER_OPTIONS_ROW_ID],
  });
  const stored = result.rows[0]?.payload_json;
  if (typeof stored !== "string") return null;
  return parsePokeTraceFilterOptions(JSON.parse(stored) as unknown);
}
