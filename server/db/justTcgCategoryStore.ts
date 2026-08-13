import type {
  JustTcgMovementPeriod,
  JustTcgMoversPayload,
} from "../../src/types/justTcgMovers.js";
import { dbAll, dbExecute, dbGet } from "./db.js";
import { findMissingColumns } from "./schemaValidationPolicy.js";

export const JUST_TCG_CATEGORIES = {
  biggestMovers: "biggest_movers",
  biggestLosers: "biggest_losers",
} as const;

export type JustTcgCategory = string;

type JustTcgCategoryRow = {
  [key: string]: unknown;
  payload_json: unknown;
  period: unknown;
  category_key: unknown;
  updated_at: unknown;
};

type TableInfoRow = {
  [key: string]: unknown;
  name: unknown;
};

const REQUIRED_JUST_TCG_CATEGORY_COLUMNS = [
  "category_key",
  "period",
  "payload_json",
  "updated_at",
] as const;

export const JUST_TCG_CATEGORIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS justtcg_categories (
    category_key TEXT NOT NULL,
    period TEXT NOT NULL
      CHECK (period IN ('24h', '7d', '30d', '90d')),
    payload_json TEXT NOT NULL
      CHECK (json_valid(payload_json)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (category_key, period)
  )
`;

export const JUST_TCG_CATEGORY_UPSERT_SQL = `
  INSERT INTO justtcg_categories (
    category_key,
    period,
    payload_json,
    updated_at
  )
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(category_key, period) DO UPDATE SET
    payload_json = excluded.payload_json,
    updated_at = CURRENT_TIMESTAMP
`;

function isJustTcgMovementPeriod(
  value: unknown,
): value is JustTcgMovementPeriod {
  return (
    value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "90d"
  );
}

function normalizeCategoryKey(category: JustTcgCategory) {
  const normalized = category.trim();
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new Error("JustTCG category key must use snake_case text");
  }

  return normalized;
}

function parseStoredJustTcgCategoryRow(
  row: JustTcgCategoryRow | undefined,
): JustTcgMoversPayload | null {
  if (!row) return null;
  if (typeof row.payload_json !== "string") {
    throw new Error("Stored JustTCG category payload must be JSON text");
  }
  if (!isJustTcgMovementPeriod(row.period)) {
    throw new Error("Stored JustTCG category period is invalid");
  }
  if (typeof row.updated_at !== "string" || !row.updated_at.trim()) {
    throw new Error("Stored JustTCG category updated_at is invalid");
  }

  const payload = JSON.parse(row.payload_json) as unknown;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !Array.isArray((payload as { cards?: unknown }).cards)
  ) {
    throw new Error("Stored JustTCG category payload has invalid shape");
  }

  return {
    cards: (payload as JustTcgMoversPayload).cards,
    period: row.period,
    updatedAt: row.updated_at,
  };
}

export async function ensureJustTcgCategoryTable(): Promise<void> {
  await dbExecute(JUST_TCG_CATEGORIES_TABLE_SQL);
}

export async function assertJustTcgCategorySchemaCompatible(): Promise<void> {
  const rows = await dbAll<TableInfoRow>(
    'PRAGMA table_info("justtcg_categories")',
  );
  if (rows.length === 0) {
    throw new Error(
      "Database schema is incompatible: justtcg_categories table is missing. Run npm run db:init or npm run justtcg:categories.",
    );
  }

  const missingColumns = findMissingColumns(
    rows.map((row) => String(row.name)),
    REQUIRED_JUST_TCG_CATEGORY_COLUMNS,
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `Database schema is incompatible: justtcg_categories is missing ${missingColumns.join(", ")}.`,
    );
  }
}

export async function saveJustTcgCategory(
  category: JustTcgCategory,
  period: JustTcgMovementPeriod,
  payload: Pick<JustTcgMoversPayload, "cards">,
): Promise<void> {
  await dbExecute(JUST_TCG_CATEGORY_UPSERT_SQL, [
    normalizeCategoryKey(category),
    period,
    JSON.stringify({ cards: payload.cards }),
  ]);
}

export async function getJustTcgCategory(
  category: JustTcgCategory,
  period: JustTcgMovementPeriod,
): Promise<JustTcgMoversPayload | null> {
  await ensureJustTcgCategoryTable();
  const categoryKey = normalizeCategoryKey(category);
  const row = await dbGet<JustTcgCategoryRow>(
    `
      SELECT category_key, period, payload_json, updated_at
      FROM justtcg_categories
      WHERE category_key = ? AND period = ?
    `,
    [categoryKey, period],
  );

  return parseStoredJustTcgCategoryRow(row);
}
