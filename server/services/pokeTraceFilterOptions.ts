import { createPokeTraceFilterOptions } from "../../shared/pokeTraceFilterOptions.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { getCachedPokeTraceCatalog } from "./pokeTraceCatalog.js";
import {
  loadStoredPokeTraceFilterOptions,
  savePokeTraceFilterOptions,
} from "./pokeTraceFilterOptionsStore.js";

export async function loadPokeTraceFilterOptions() {
  await ensurePokeTraceReady();
  const stored = await loadStoredPokeTraceFilterOptions(pokeTraceDb);
  if (
    stored &&
    stored.setSummaries.length === stored.setNames.length &&
    stored.setSummaries.every(({ asOf }) => asOf === stored.generatedAt)
  ) {
    return stored;
  }

  // Self-heal after deployment if the endpoint is requested before the next
  // daily refresh has created the current enriched payload.
  const options = createPokeTraceFilterOptions(
    await getCachedPokeTraceCatalog(),
  );
  await savePokeTraceFilterOptions(pokeTraceDb, options);
  return options;
}
