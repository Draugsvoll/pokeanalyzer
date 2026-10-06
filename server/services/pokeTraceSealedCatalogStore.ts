import type { Client } from "@libsql/client";
import {
  parsePokeTraceSealedCatalogResponse,
  type PokeTraceSealedCatalogResponse,
} from "../../shared/pokeTraceSealed.js";

const POKETRACE_SEALED_CATALOG_ROW_ID = "current";

type CatalogStoreDatabase = Pick<Client, "execute">;

export async function ensurePokeTraceSealedCatalogStore(
  database: CatalogStoreDatabase,
) {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_sealed_catalog_payloads (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      generated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function savePokeTraceSealedCatalog(
  database: CatalogStoreDatabase,
  catalog: PokeTraceSealedCatalogResponse,
) {
  const validated = parsePokeTraceSealedCatalogResponse(catalog);
  await database.execute({
    sql: `
      INSERT INTO poketrace_sealed_catalog_payloads
        (id, payload_json, generated_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        payload_json = excluded.payload_json,
        generated_at = excluded.generated_at,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      POKETRACE_SEALED_CATALOG_ROW_ID,
      JSON.stringify(validated),
      validated.generatedAt,
    ],
  });
}

export async function loadStoredPokeTraceSealedCatalog(
  database: CatalogStoreDatabase,
): Promise<PokeTraceSealedCatalogResponse | null> {
  const result = await database.execute({
    sql: `
      SELECT payload_json
      FROM poketrace_sealed_catalog_payloads
      WHERE id = ?
    `,
    args: [POKETRACE_SEALED_CATALOG_ROW_ID],
  });
  const stored = result.rows[0]?.payload_json;
  if (typeof stored !== "string") return null;
  return parsePokeTraceSealedCatalogResponse(JSON.parse(stored) as unknown);
}
