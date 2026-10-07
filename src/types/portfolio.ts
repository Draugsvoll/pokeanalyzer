import type { PokemonCard } from "./pokemon";
import type { PriceChangePeriod } from "../../shared/priceChangePeriod";
import type { PokeTraceSealedCatalogProduct } from "../../shared/pokeTraceSealed";

export type PortfolioItemType = "single" | "sealed";

export type PortfolioReference = {
  id: string;
  type: PortfolioItemType;
  quantity: number;
};

export type PortfolioSingle = PokemonCard & {
  quantity: number;
  priceSnapshots?: Partial<
    Record<PortfolioComparisonPeriod, PortfolioPriceSnapshot>
  >;
  type: "single";
};

export type PortfolioSealedProduct = PokeTraceSealedCatalogProduct & {
  quantity: number;
  type: "sealed";
};

export type PortfolioItem = PortfolioSingle | PortfolioSealedProduct;

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
  items: PortfolioItem[];
  missingItems: PortfolioReference[];
};

export type AddPortfolioItemResponse = {
  created: boolean;
  entry: PortfolioReference;
};
