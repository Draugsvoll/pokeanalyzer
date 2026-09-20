export const MARKET_MOVER_DIRECTIONS = ["gainers", "losers"] as const;
export type MarketMoverDirection = (typeof MARKET_MOVER_DIRECTIONS)[number];

export const POKETRACE_MARKETS = ["US", "EU"] as const;
export type PokeTraceMarket = (typeof POKETRACE_MARKETS)[number];

export const POKETRACE_GAMES = [
  "pokemon",
  "pokemon-japanese",
  "pokemon-chinese",
  "pokemon-thai",
  "pokemon-indonesian",
] as const;
export type PokeTraceGame = (typeof POKETRACE_GAMES)[number];

export type MarketMoversQuery = {
  direction: MarketMoverDirection;
  game: PokeTraceGame;
  hasGraded?: boolean;
  limit: number;
  market: PokeTraceMarket;
  maxDiff?: number;
  minPrice?: number;
  source?: string;
  tier?: string;
};

export type MarketMoverItem = {
  approxSaleCount: boolean;
  cardId: string;
  cardNumber: string | null;
  changeAbs: number;
  changePct: number;
  currency: "USD" | "EUR";
  currentPrice: number;
  game: string;
  image: string | null;
  name: string;
  price7dAvg: number;
  rarity: string | null;
  saleCount: number;
  set: {
    name: string;
    slug: string;
  };
  source: string;
  tier: string;
  variant: string | null;
};

export type MarketMoversResponse = {
  fetchedAt: string;
  items: MarketMoverItem[];
  query: MarketMoversQuery;
  stale: boolean;
};
