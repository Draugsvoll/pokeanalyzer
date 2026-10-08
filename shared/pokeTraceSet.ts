import type { PokeTraceSearchResponse } from "./pokeTraceSearch.js";

export type PokeTraceSetSalesLeader = {
  cardId: string;
};

export type PokeTraceSetSalesLeaders = {
  total: PokeTraceSetSalesLeader | null;
};

export type PokeTraceSetResponse<TItem> = PokeTraceSearchResponse<TItem> & {
  salesLeaders: PokeTraceSetSalesLeaders;
};
