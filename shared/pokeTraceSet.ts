import type { PokeTraceSearchResponse } from "./pokeTraceSearch.js";

export type PokeTraceSetSalesLeader = {
  approximate: boolean;
  cardId: string;
  sales: number;
};

export type PokeTraceSetSalesLeaders = {
  leastTotal: PokeTraceSetSalesLeader | null;
  total: PokeTraceSetSalesLeader | null;
};

export type PokeTraceSetResponse<TItem> = PokeTraceSearchResponse<TItem> & {
  salesLeaders: PokeTraceSetSalesLeaders;
};
