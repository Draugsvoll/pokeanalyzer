import type {
  MostSoldOptions,
  PriceGainersOptions,
} from "../services/marketCategoryQueries.js";

type PriceGainersCategoryDefinition = {
  id: string;
  parameters: Partial<PriceGainersOptions>;
  query: "priceGainers";
  title: string;
};

type MostSoldCategoryDefinition = {
  id: string;
  parameters: Partial<MostSoldOptions>;
  query: "mostSold";
  title: string;
};

export type MarketCategoryDefinition =
  MostSoldCategoryDefinition | PriceGainersCategoryDefinition;

// Add or duplicate entries here to export more categories in the same JSON file.
export const MARKET_CATEGORY_DEFINITIONS = [
  {
    id: "daily-tcg-near-mint-gainers",
    parameters: {
      condition: "NEAR_MINT",
      limit: 10,
      minimumChange: 0,
      minimumChangePercent: 0,
      minimumPrice: 20,
      periodDays: 1,
      sortBy: "percentage",
      source: "tcgplayer",
    },
    query: "priceGainers",
    title: "Daily TCGPlayer Near Mint Gainers",
  },
  {
    id: "most-sold",
    parameters: {
      limit: 10,
      minimumPrice: 20,
      minimumSales: 1,
      source: "both",
    },
    query: "mostSold",
    title: "Most Sold",
  },
] satisfies MarketCategoryDefinition[];
