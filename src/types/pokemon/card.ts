import type { TcgSnapshot } from "../../../shared/tcgExplorer";
import type {
  GradedHistoryTier,
  MarketHistoryTier,
} from "../../../shared/pokeTraceHistoryTiers";
import type { CardPriceHistoryResponse } from "../../../shared/pokeTracePriceHistory";
import type { CardSet } from "./set";
import type {
  PokeTraceMarket,
  PokeTraceMarketSource,
  PokeTraceMarkets,
  PokeTracePrices,
} from "../../../shared/pokeTraceMarkets";
import type {
  PokeTraceMarketComparisonPeriod,
  PokeTraceMarketComparisons,
} from "../../../shared/pokeTraceMarketComparisons";

export type PokeTraceMarketHistorySource = PokeTraceMarketSource;

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
  condition: MarketHistoryTier;
  period: "1y";
  currency: string;
  fetchedAt: string;
  stale: boolean;
  market: PokeTraceMarket;
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
  image?: string;
  ebay?: Record<string, unknown> & { timestamp: string };
  ebay_raw?: Record<string, unknown> & { timestamp: string };
  tcg_listings?: TcgSnapshot;
  grok?: {
    collectors_analysis?: Record<string, unknown> & { timestamp: string };
    market_analysis?: Record<string, unknown> & { timestamp: string };
    worth_grading?: Record<string, unknown> & { timestamp: string };
  };
  quantity?: number;
  pokeTrace: {
    currency: string;
    marketplaceUrls: Record<string, unknown>;
    prices: Record<string, unknown>;
    markets?: PokeTraceMarkets;
    marketPrices?: PokeTracePrices;
    gradedOptions?: GradedHistoryTier[];
    variant?: string;
    variants?: Array<{
      id: string;
      name: string;
    }>;
    lastUpdated?: string;
    marketComparisons?: PokeTraceMarketComparisons;
    marketPriceSnapshots?: Partial<
      Record<PokeTraceMarketComparisonPeriod, number | null>
    >;
    marketPriceHistory?: PokeTraceMarketHistory;
    priceHistory?: CardPriceHistoryResponse;
  };
};
