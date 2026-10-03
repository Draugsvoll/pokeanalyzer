import type { Client } from "@libsql/client";
import type { PokeTraceCatalogResponse } from "../../shared/pokeTraceCatalog.js";
import { createPokeTraceFilterOptions } from "../../shared/pokeTraceFilterOptions.js";
import { generatePokeTraceCatalog } from "../services/pokeTraceCatalog.js";
import { savePokeTraceCatalog } from "../services/pokeTraceCatalogStore.js";
import { savePokeTraceFilterOptions } from "../services/pokeTraceFilterOptionsStore.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";

export async function generateAndSavePokeTraceCatalog(
  database: Client,
  assertHeld: () => void,
) {
  const catalog = await generatePokeTraceCatalog(database);
  assertHeld();
  await savePokeTraceCatalog(database, catalog);
  assertHeld();
  await savePokeTraceFilterOptions(
    database,
    createPokeTraceFilterOptions(catalog),
  );
  return catalog;
}

export async function runPokeTraceCatalogGeneration(
  database: Client,
): Promise<PokeTraceCatalogResponse | null> {
  let savedCatalog: PokeTraceCatalogResponse | null = null;
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    savedCatalog = await generateAndSavePokeTraceCatalog(database, assertHeld);
  }, database);

  return acquired ? savedCatalog : null;
}
