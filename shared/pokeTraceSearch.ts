export const POKETRACE_SEARCH_PAGE_SIZE = 50;
export const POKETRACE_SEARCH_RESULT_LIMIT = 2_000;

export const POKETRACE_SEARCH_SORTS = [
  "price-high-low",
  "price-low-high",
] as const;

export type PokeTraceSearchSort = (typeof POKETRACE_SEARCH_SORTS)[number];
export const POKETRACE_DEFAULT_SEARCH_SORT: PokeTraceSearchSort =
  "price-high-low";

export type PokeTraceSearchResponse<TItem> = {
  items: TItem[];
  total: number;
};

export function isPokeTraceSearchSort(
  value: string,
): value is PokeTraceSearchSort {
  return (POKETRACE_SEARCH_SORTS as readonly string[]).includes(value);
}
