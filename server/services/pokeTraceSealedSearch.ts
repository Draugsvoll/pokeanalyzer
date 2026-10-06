import {
  POKETRACE_SEALED_SEARCH_RESULT_LIMIT,
  type PokeTraceSealedCatalogProduct,
  type PokeTraceSealedSearch,
  type PokeTraceSealedSearchResponse,
} from "../../shared/pokeTraceSealed.js";
import {
  getCachedPokeTraceSealedCatalog,
  peekCachedPokeTraceSealedCatalog,
  warmPokeTraceSealedCatalogInBackground,
} from "./pokeTraceSealedCatalog.js";

function searchableText(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLocaleLowerCase("en-US");
}

function contains(value: string, query: string) {
  return searchableText(value).includes(searchableText(query));
}

export function searchPokeTraceSealedCatalog(
  products: PokeTraceSealedCatalogProduct[],
  search: PokeTraceSealedSearch,
) {
  const name = search.name.trim().toLocaleLowerCase("en-US");
  const setName = search.setName.trim().toLocaleLowerCase("en-US");
  const family = search.productFamily.trim().toLocaleLowerCase("en-US");
  return products
    .filter((product) => {
      if (name && !contains(product.name, name)) return false;
      if (setName && !contains(product.setName, setName)) return false;
      if (family && !contains(product.productFamily, family)) return false;
      if (search.minPrice !== undefined) {
        if (product.price === null || product.price < search.minPrice) {
          return false;
        }
      }
      if (search.maxPrice !== undefined) {
        if (product.price === null || product.price > search.maxPrice) {
          return false;
        }
      }
      return true;
    })
    .slice(0, POKETRACE_SEALED_SEARCH_RESULT_LIMIT);
}

export async function loadPokeTraceSealedSearch(
  search: PokeTraceSealedSearch,
): Promise<PokeTraceSealedSearchResponse> {
  const catalog = peekCachedPokeTraceSealedCatalog();
  warmPokeTraceSealedCatalogInBackground();
  const publishedCatalog = catalog ?? (await getCachedPokeTraceSealedCatalog());
  const items = searchPokeTraceSealedCatalog(publishedCatalog.products, search);
  return { items, total: items.length };
}
