import type { PokemonCard } from "./pokemon";
import type { PriceChangePeriod } from "../../shared/priceChangePeriod";

export type PortfolioReference = {
  cardId: string;
  quantity: number;
};

export type PortfolioCard = PokemonCard & {
  quantity: number;
  priceSnapshots?: Partial<
    Record<PortfolioComparisonPeriod, PortfolioPriceSnapshot>
  >;
};

export type PortfolioComparisonPeriod = PriceChangePeriod;

export type PortfolioPriceSnapshot = {
  recordedAt: string;
  marketPrice: number;
  sourceUpdatedAt: string | null;
};

export type PortfolioReferencesResponse = {
  entries: PortfolioReference[];
};

export type HydratedPortfolioResponse = PortfolioReferencesResponse & {
  cards: PortfolioCard[];
  missingCardIds: string[];
};

export type AddPortfolioCardResponse = {
  created: boolean;
  entry: PortfolioReference;
};
