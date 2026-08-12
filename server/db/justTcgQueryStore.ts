import type {
  JustTcgMovementPeriod,
  JustTcgMoversPayload,
} from "../../src/types/justTcgMovers.js";
import { dbAll, dbExecute, dbGet } from "./db.js";
import { findMissingColumns } from "./schemaValidationPolicy.js";

export const JUST_TCG_QUERIES = {
  biggestMovers: "biggest_movers",
  biggestLosers: "biggest_losers",
} as const;

export type JustTcgQuery = string;

type JustTcgQueryRow = {
  [key: string]: unknown;
  payload_json: unknown;
  period: unknown;
  query_key: unknown;
  updated_at: unknown;
};

type TableInfoRow = {
  [key: string]: unknown;
  name: unknown;
};

const REQUIRED_JUST_TCG_QUERY_COLUMNS = [
  "query_key",
  "period",
  "payload_json",
  "updated_at",
] as const;

export const JUST_TCG_QUERIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS justtcg_queries (
    query_key TEXT NOT NULL,
    period TEXT NOT NULL
      CHECK (period IN ('24h', '7d', '30d')),
    payload_json TEXT NOT NULL
      CHECK (json_valid(payload_json)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (query_key, period)
  )
`;

export const JUST_TCG_QUERY_UPSERT_SQL = `
  INSERT INTO justtcg_queries (
    query_key,
    period,
    payload_json,
    updated_at
  )
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(query_key, period) DO UPDATE SET
    payload_json = excluded.payload_json,
    updated_at = CURRENT_TIMESTAMP
`;

function isJustTcgMovementPeriod(
  value: unknown,
): value is JustTcgMovementPeriod {
  return value === "24h" || value === "7d" || value === "30d";
}

function normalizeQueryKey(query: JustTcgQuery) {
  const normalized = query.trim();
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new Error("JustTCG query key must use snake_case text");
  }

  return normalized;
}

function parseStoredJustTcgQueryRow(
  row: JustTcgQueryRow | undefined,
): JustTcgMoversPayload | null {
  if (!row) return null;
  if (typeof row.payload_json !== "string") {
    throw new Error("Stored JustTCG query payload must be JSON text");
  }
  if (!isJustTcgMovementPeriod(row.period)) {
    throw new Error("Stored JustTCG query period is invalid");
  }
  if (typeof row.updated_at !== "string" || !row.updated_at.trim()) {
    throw new Error("Stored JustTCG query updated_at is invalid");
  }

  const payload = JSON.parse(row.payload_json) as unknown;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !Array.isArray((payload as { cards?: unknown }).cards)
  ) {
    throw new Error("Stored JustTCG query payload has invalid shape");
  }

  return {
    cards: (payload as JustTcgMoversPayload).cards,
    period: row.period,
    updatedAt: row.updated_at,
  };
}

export async function ensureJustTcgQueryTable(): Promise<void> {
  await dbExecute(JUST_TCG_QUERIES_TABLE_SQL);
}

export async function assertJustTcgQuerySchemaCompatible(): Promise<void> {
  const rows = await dbAll<TableInfoRow>(
    'PRAGMA table_info("justtcg_queries")',
  );
  if (rows.length === 0) {
    throw new Error(
      "Database schema is incompatible: justtcg_queries table is missing. Run npm run db:init or npm run justtcg:queries.",
    );
  }

  const missingColumns = findMissingColumns(
    rows.map((row) => String(row.name)),
    REQUIRED_JUST_TCG_QUERY_COLUMNS,
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `Database schema is incompatible: justtcg_queries is missing ${missingColumns.join(", ")}.`,
    );
  }
}

export async function saveJustTcgQuery(
  query: JustTcgQuery,
  period: JustTcgMovementPeriod,
  payload: Pick<JustTcgMoversPayload, "cards">,
): Promise<void> {
  await dbExecute(JUST_TCG_QUERY_UPSERT_SQL, [
    normalizeQueryKey(query),
    period,
    JSON.stringify({ cards: payload.cards }),
  ]);
}

export async function getJustTcgQuery(
  query: JustTcgQuery,
  period: JustTcgMovementPeriod,
): Promise<JustTcgMoversPayload | null> {
  await ensureJustTcgQueryTable();
  const queryKey = normalizeQueryKey(query);
  const row = await dbGet<JustTcgQueryRow>(
    `
      SELECT query_key, period, payload_json, updated_at
      FROM justtcg_queries
      WHERE query_key = ? AND period = ?
    `,
    [queryKey, period],
  );

  return parseStoredJustTcgQueryRow(row);
}
