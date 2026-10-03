import type { Client } from "@libsql/client";
import {
  createPokeTraceFilterOptions,
  type PokeTraceFilterOptions,
} from "../../shared/pokeTraceFilterOptions.js";
import { generatePokeTraceCatalog } from "../services/pokeTraceCatalog.js";
import {
  loadStoredPokeTraceCatalog,
  savePokeTraceCatalog,
} from "../services/pokeTraceCatalogStore.js";
import {
  loadStoredPokeTraceFilterOptions,
  savePokeTraceFilterOptions,
} from "../services/pokeTraceFilterOptionsStore.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";

export type PokeTraceSetListGenerationResult = {
  catalogGenerated: boolean;
  options: PokeTraceFilterOptions;
  setListUpdated: boolean;
};

function isCompleteSetList(
  options: PokeTraceFilterOptions | null,
  catalogGeneratedAt: string,
): options is PokeTraceFilterOptions {
  return Boolean(
    options &&
    options.generatedAt === catalogGeneratedAt &&
    options.setSummaries.length === options.setNames.length &&
    options.setSummaries.every(({ asOf }) => asOf === catalogGeneratedAt),
  );
}

export async function generateAndSavePokeTraceSetList(
  database: Client,
  assertHeld: () => void,
): Promise<PokeTraceSetListGenerationResult> {
  let catalog = await loadStoredPokeTraceCatalog(database);
  let catalogGenerated = false;

  if (!catalog) {
    catalog = await generatePokeTraceCatalog(database);
    assertHeld();
    await savePokeTraceCatalog(database, catalog);
    catalogGenerated = true;
  }

  const storedOptions = await loadStoredPokeTraceFilterOptions(database);
  if (isCompleteSetList(storedOptions, catalog.generatedAt)) {
    return {
      catalogGenerated,
      options: storedOptions,
      setListUpdated: false,
    };
  }

  const options = createPokeTraceFilterOptions(catalog);
  assertHeld();
  await savePokeTraceFilterOptions(database, options);
  return { catalogGenerated, options, setListUpdated: true };
}

export async function runPokeTraceSetListGeneration(
  database: Client,
): Promise<PokeTraceSetListGenerationResult | null> {
  let result: PokeTraceSetListGenerationResult | null = null;
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    result = await generateAndSavePokeTraceSetList(database, assertHeld);
  }, database);

  return acquired ? result : null;
}
