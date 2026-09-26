import type { Client } from "@libsql/client";
import { generateAndSavePokeTraceCatalog } from "./pokeTraceCatalogGenerationJob.js";

export type PokeTraceDailyRefreshResult = "SUCCESS" | "PARTIAL SUCCESS";

export async function completePokeTraceDailyRefresh(
  database: Client,
  assertHeld: () => void,
  deferredCards: number,
): Promise<{
  catalogCards: number;
  result: PokeTraceDailyRefreshResult;
}> {
  const catalog = await generateAndSavePokeTraceCatalog(database, assertHeld);
  return {
    catalogCards: catalog.cards.length,
    result: deferredCards > 0 ? "PARTIAL SUCCESS" : "SUCCESS",
  };
}
