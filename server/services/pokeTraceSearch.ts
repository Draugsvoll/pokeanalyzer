import { toPokeTraceCatalogPokemonCard } from "../../shared/pokeTraceCatalog.js";
import { searchPokeTraceCatalogCards } from "../../shared/pokeTraceCatalogSearch.js";
import type { PokeTraceRawCondition } from "../../shared/pokeTraceMarketConditions.js";
import {
  POKETRACE_SEARCH_RESULT_LIMIT,
  type PokeTraceSearchResponse,
} from "../../shared/pokeTraceSearch.js";
import {
  peekCachedPokeTraceCatalog,
  warmPokeTraceCatalogInBackground,
} from "./pokeTraceCatalog.js";
import { loadDirectPokeTraceSearch } from "./pokeTraceDirectSearch.js";

export type PokeTraceSearchQuery = {
  cardId: string;
  cardNumber: string;
  condition?: PokeTraceRawCondition;
  maxPrice?: number;
  minPrice?: number;
  pokemonName: string;
  rarity: string;
  setName: string;
  setNameExact?: boolean;
};

type SearchDependencies = {
  loadDirect: typeof loadDirectPokeTraceSearch;
  peekCatalog: typeof peekCachedPokeTraceCatalog;
  warmCatalog: typeof warmPokeTraceCatalogInBackground;
};

export async function loadPokeTraceSearch(
  query: PokeTraceSearchQuery,
  dependencies: Partial<SearchDependencies> = {},
): Promise<
  PokeTraceSearchResponse<ReturnType<typeof toPokeTraceCatalogPokemonCard>>
> {
  const peekCatalog = dependencies.peekCatalog ?? peekCachedPokeTraceCatalog;
  const warmCatalog =
    dependencies.warmCatalog ?? warmPokeTraceCatalogInBackground;
  const loadDirect = dependencies.loadDirect ?? loadDirectPokeTraceSearch;
  const catalog = peekCatalog();
  warmCatalog();
  if (!catalog) return loadDirect(query);

  const items = searchPokeTraceCatalogCards(catalog.cards, query, {
    limit: POKETRACE_SEARCH_RESULT_LIMIT,
  }).map(toPokeTraceCatalogPokemonCard);

  return {
    items,
    total: items.length,
  };
}
