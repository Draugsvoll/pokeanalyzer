import type { CardSet } from "./set";
import type { CardImages } from "./images";
import type { PokeTraceMarketComparisons } from "../../../shared/pokeTraceMarketComparisons";

export type PokeTraceMarketHistorySource = "tcgplayer" | "ebay";

export type PokeTraceMarketHistoryPoint = {
  date: string;
  avg: number;
  median7d: number | null;
  median30d: number | null;
  low: number | null;
  high: number | null;
  saleCount: number | null;
  approxSaleCount: boolean | null;
};

export type PokeTraceMarketHistory = {
  cardId: string;
  condition: "NEAR_MINT";
  period: "90d";
  currency: string;
  fetchedAt: string;
  stale: boolean;
  series: Partial<
    Record<PokeTraceMarketHistorySource, PokeTraceMarketHistoryPoint[]>
  >;
};

export type PokemonCard = {
  id: string;
  name: string;
  set: CardSet;
  number?: string;
  rarity?: string;
  images: CardImages;
  grok?: {
    collectors_analysis?: Record<string, unknown> & { timestamp: string };
    market_analysis?: Record<string, unknown> & { timestamp: string };
    ebay_sold?: Record<string, unknown> & { timestamp: string };
    worth_grading?: Record<string, unknown> & { timestamp: string };
  };
  quantity?: number;
  pokeTrace: {
    currency: string;
    marketplaceUrls: Record<string, unknown>;
    prices: Record<string, unknown>;
    variant?: string;
    variants?: Array<{
      id: string;
      name: string;
    }>;
    lastUpdated?: string;
    marketComparisons?: PokeTraceMarketComparisons;
    marketPriceHistory?: PokeTraceMarketHistory;
  };
};
