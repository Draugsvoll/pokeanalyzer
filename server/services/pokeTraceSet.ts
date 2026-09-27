import { toPokeTraceCatalogPokemonCard } from "../../shared/pokeTraceCatalog.js";
import { POKETRACE_SEARCH_RESULT_LIMIT } from "../../shared/pokeTraceSearch.js";
import type { PokeTraceSearchResponse } from "../../shared/pokeTraceSearch.js";
import {
  peekCachedPokeTraceCatalog,
  warmPokeTraceCatalogInBackground,
} from "./pokeTraceCatalog.js";
import { loadDirectPokeTraceSearch } from "./pokeTraceDirectSearch.js";

type SetDependencies = {
  loadDirect: typeof loadDirectPokeTraceSearch;
  peekCatalog: typeof peekCachedPokeTraceCatalog;
  warmCatalog: typeof warmPokeTraceCatalogInBackground;
};

function normalizeSetName(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export async function loadPokeTraceSet(
  setName: string,
  dependencies: Partial<SetDependencies> = {},
): Promise<
  PokeTraceSearchResponse<ReturnType<typeof toPokeTraceCatalogPokemonCard>>
> {
  const peekCatalog = dependencies.peekCatalog ?? peekCachedPokeTraceCatalog;
  const warmCatalog =
    dependencies.warmCatalog ?? warmPokeTraceCatalogInBackground;
  const loadDirect = dependencies.loadDirect ?? loadDirectPokeTraceSearch;
  const catalog = peekCatalog();
  warmCatalog();
  if (!catalog) {
    return loadDirect({
      cardNumber: "",
      pokemonName: "",
      setName,
      setNameExact: true,
    });
  }

  const normalizedSetName = normalizeSetName(setName);
  const items = catalog.cards
    .filter((card) => normalizeSetName(card.setName) === normalizedSetName)
    .slice(0, POKETRACE_SEARCH_RESULT_LIMIT)
    .map(toPokeTraceCatalogPokemonCard);

  return { items, total: items.length };
}
