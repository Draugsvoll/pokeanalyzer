import {
  toPokeTraceCatalogPokemonCard,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog.js";
import { searchPokeTraceCatalogCards } from "../../shared/pokeTraceCatalogSearch.js";
import type { PokeTraceRawCondition } from "../../shared/pokeTraceMarketConditions.js";
import {
  POKETRACE_SEARCH_RESULT_LIMIT,
  type PokeTraceSearchResponse,
  type PokeTraceSearchSort,
} from "../../shared/pokeTraceSearch.js";
import { getCachedPokeTraceCatalog } from "./pokeTraceCatalog.js";

export type PokeTraceSearchQuery = {
  cardId: string;
  cardNumber: string;
  condition?: PokeTraceRawCondition;
  maxPrice?: number;
  minPrice?: number;
  pokemonName: string;
  rarity: string;
  setName: string;
  sort: PokeTraceSearchSort;
};

type CatalogLoader = () => Promise<PokeTraceCatalogResponse>;

export async function loadPokeTraceSearch(
  query: PokeTraceSearchQuery,
  loadCatalog: CatalogLoader = getCachedPokeTraceCatalog,
): Promise<
  PokeTraceSearchResponse<ReturnType<typeof toPokeTraceCatalogPokemonCard>>
> {
  const catalog = await loadCatalog();
  const items = searchPokeTraceCatalogCards(catalog.cards, query, {
    limit: POKETRACE_SEARCH_RESULT_LIMIT,
  }).map(toPokeTraceCatalogPokemonCard);

  return {
    items,
    total: items.length,
  };
}
