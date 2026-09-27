export const POKETRACE_SEARCH_PAGE_SIZE = 50;
export const POKETRACE_SEARCH_RESULT_LIMIT = 2_000;

export const POKETRACE_SEARCH_SORTS = [
  "price-high-low",
  "price-low-high",
  "card-number-low-high",
  "card-number-high-low",
  "change-high-low",
  "change-low-high",
] as const;

export type PokeTraceSearchSort = (typeof POKETRACE_SEARCH_SORTS)[number];

export type PokeTraceSearchResponse<TItem> = {
  items: TItem[];
  total: number;
};
