export type PokeTraceMarket = "US" | "EU";
export type PokeTraceMarketSource =
  "tcgplayer" | "ebay" | "cardmarket" | "cardmarket_unsold";

export type PokeTracePrice = {
  avg?: number | null;
  median3d?: number | null;
  median7d?: number | null;
  median30d?: number | null;
  saleCount?: number | null;
  lastUpdated?: string | null;
  [field: string]: unknown;
};

export type PokeTracePrices = Record<
  string,
  Partial<
    Record<
      PokeTraceMarket,
      Partial<Record<PokeTraceMarketSource, PokeTracePrice>>
    >
  >
>;

export type PokeTraceMarkets = Partial<
  Record<
    PokeTraceMarket,
    {
      available: boolean;
      cardId?: string;
      currency?: string;
      variant?: string;
      reason?: string;
    }
  >
>;

export function isPokeTraceMarket(value: unknown): value is PokeTraceMarket {
  return value === "US" || value === "EU";
}
