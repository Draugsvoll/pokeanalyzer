import type { PokemonCard } from "./pokemon";

export type PortfolioReference = {
  cardId: string;
  quantity: number;
  priceSource?: string;
};

export type PortfolioCard = PokemonCard & {
  quantity: number;
  priceSource?: string;
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
