import type { Client } from "@libsql/client";
import {
  MARKET_CATEGORY_DEFINITIONS,
  type MarketCategoryDefinition,
} from "../config/marketCategories.js";
import { findMostSold, findPriceMovers } from "./marketCategoryQueries.js";

const MARKET_CATEGORIES_ROW_ID = "current";

type MarketCategoryDatabase = Pick<Client, "execute">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function generateMarketCategories(
  database: MarketCategoryDatabase,
  definitions: readonly MarketCategoryDefinition[] = MARKET_CATEGORY_DEFINITIONS,
) {
  const ids = new Set<string>();
  const categories = [];

  for (const definition of definitions) {
    if (!definition.id.trim() || ids.has(definition.id)) {
      throw new Error(`Market category id must be unique: ${definition.id}`);
    }
    ids.add(definition.id);

    const result =
      definition.query === "priceMovers"
        ? await findPriceMovers(database, definition.parameters)
        : await findMostSold(database, definition.parameters);
    categories.push({
      id: definition.id,
      query: definition.query,
      title: definition.title,
      ...result,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories,
  };
}

export type MarketCategoriesPayload = Awaited<
  ReturnType<typeof generateMarketCategories>
>;

export function parseMarketCategoriesPayload(
  value: unknown,
): MarketCategoriesPayload {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !Array.isArray(value.categories)
  ) {
    throw new Error("Invalid stored market categories");
  }

  const ids = new Set<string>();
  for (const category of value.categories) {
    if (
      !isRecord(category) ||
      typeof category.id !== "string" ||
      !category.id.trim() ||
      ids.has(category.id)
    ) {
      throw new Error("Invalid stored market categories");
    }
    ids.add(category.id);
  }

  return value as MarketCategoriesPayload;
}

export async function ensureMarketCategoriesStore(
  database: MarketCategoryDatabase,
) {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_market_categories (
      id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      generated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function saveMarketCategories(
  database: MarketCategoryDatabase,
  payload: MarketCategoriesPayload,
) {
  const validated = parseMarketCategoriesPayload(payload);
  await database.execute({
    sql: `
      INSERT INTO poketrace_market_categories
        (id, payload_json, generated_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        payload_json = excluded.payload_json,
        generated_at = excluded.generated_at,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      MARKET_CATEGORIES_ROW_ID,
      JSON.stringify(validated),
      validated.generatedAt,
    ],
  });
}

export async function loadMarketCategories(
  database: MarketCategoryDatabase,
): Promise<MarketCategoriesPayload | null> {
  const result = await database.execute({
    sql: `
      SELECT payload_json
      FROM poketrace_market_categories
      WHERE id = ?
    `,
    args: [MARKET_CATEGORIES_ROW_ID],
  });
  const stored = result.rows[0]?.payload_json;
  if (typeof stored !== "string") return null;
  return parseMarketCategoriesPayload(JSON.parse(stored) as unknown);
}
