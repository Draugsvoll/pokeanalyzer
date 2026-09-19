import type { CardSet } from "./set";
import type { CardImages } from "./images";
import type { PokeTraceMarketComparisons } from "../../../shared/pokeTraceMarketComparisons";

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
  };
};
