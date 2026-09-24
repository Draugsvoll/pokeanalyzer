import type { Client } from "@libsql/client";
import {
  MARKET_CATEGORY_DEFINITIONS,
  type MarketCategoryDefinition,
} from "../config/marketCategories.js";
import {
  generateMarketCategories,
  saveMarketCategories,
  type MarketCategoriesPayload,
} from "../services/marketCategories.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";

export async function runMarketCategoryGeneration(
  database: Client,
  definitions: readonly MarketCategoryDefinition[] = MARKET_CATEGORY_DEFINITIONS,
): Promise<MarketCategoriesPayload | null> {
  let savedPayload: MarketCategoriesPayload | null = null;
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    const payload = await generateMarketCategories(database, definitions);
    assertHeld();
    await saveMarketCategories(database, payload);
    savedPayload = payload;
  }, database);

  return acquired ? savedPayload : null;
}
