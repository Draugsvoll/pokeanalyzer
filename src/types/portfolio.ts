import type { CardMarket, PokemonCard, TCGPlayer } from "./pokemon";

export type PortfolioReference = {
  cardId: string;
  quantity: number;
  priceSources?: Partial<Record<PortfolioPriceSource, string>>;
  allPriceSource?: PortfolioPriceSource;
};

export type PortfolioPriceSource = "tcgplayer" | "cardmarket" | "justtcg";
export type PortfolioPriceMode = "all";

export type PortfolioCard = PokemonCard & {
  quantity: number;
  priceSources?: Partial<Record<PortfolioPriceSource, string>>;
  allPriceSource?: PortfolioPriceSource;
  justtcgRetry?: {
    hasLookupIds: boolean;
    lookupFailedAt?: string;
    priceFailedAt?: string;
  };
  priceSnapshots?: Partial<
    Record<PortfolioComparisonPeriod, PortfolioPriceSnapshot>
  >;
};

export type PortfolioComparisonPeriod = "latest" | "24h" | "7d" | "30d";

export type PortfolioPriceSnapshot = {
  recordedAt: string;
  tcgplayerPrices: Partial<TCGPlayer["prices"]> | null;
  cardmarketPrices: Partial<CardMarket["prices"]> | null;
  tcgplayerUpdatedAt: string | null;
  cardmarketUpdatedAt: string | null;
};

export type PortfolioReferencesResponse = {
  entries: PortfolioReference[];
};

export type HydratedPortfolioResponse = PortfolioReferencesResponse & {
  cards: PortfolioCard[];
  missingCardIds: string[];
  portfolioPriceSource: PortfolioPriceMode;
  portfolioJustTcgPricesFetchedAt?: string;
};

export type AddPortfolioCardResponse = {
  created: boolean;
  entry: PortfolioReference;
};
