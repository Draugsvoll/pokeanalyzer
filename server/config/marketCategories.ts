import type {
  MostSoldOptions,
  PriceMoversOptions,
} from "../services/marketCategoryQueries.js";

type PriceMoversCategoryDefinition = {
  id: string;
  parameters: Partial<PriceMoversOptions>;
  query: "priceMovers";
  title: string;
};

type MostSoldCategoryDefinition = {
  id: string;
  parameters: Partial<MostSoldOptions>;
  query: "mostSold";
  title: string;
};

export type MarketCategoryDefinition =
  MostSoldCategoryDefinition | PriceMoversCategoryDefinition;

// Add or duplicate entries here to export more categories in the same JSON file.
export const MARKET_CATEGORY_DEFINITIONS = [
  {
    id: "daily-tcg-near-mint-gainers",
    parameters: {
      condition: "NEAR_MINT",
      direction: "gainers",
      limit: 10,
      minimumChange: 0,
      minimumChangePercent: 0,
      minimumPrice: 20,
      minimumSales: 21,
      minimumSalesIncrease: 1,
      periodDays: 1,
      sortBy: "percentage",
      source: "tcgplayer",
    },
    query: "priceMovers",
    title: "Daily TCGPlayer Near Mint Gainers",
  },
  {
    id: "daily-tcg-near-mint-losers",
    parameters: {
      condition: "NEAR_MINT",
      direction: "losers",
      limit: 10,
      minimumChange: 0,
      minimumChangePercent: 0,
      minimumPrice: 20,
      minimumSales: 21,
      minimumSalesIncrease: 1,
      periodDays: 1,
      sortBy: "percentage",
      source: "tcgplayer",
    },
    query: "priceMovers",
    title: "Daily TCGPlayer Near Mint Losers",
  },
  {
    id: "most-sold",
    parameters: {
      condition: "ALL",
      limit: 10,
      minimumPrice: 20,
      minimumNewSales: 1,
      periodDays: 1,
      source: "tcgplayer",
    },
    query: "mostSold",
    title: "Daily Most Sold on TCGPlayer",
  },
  {
    id: "most-sold-ebay",
    parameters: {
      condition: "ALL",
      limit: 10,
      minimumPrice: 20,
      minimumNewSales: 1,
      periodDays: 1,
      source: "ebay",
    },
    query: "mostSold",
    title: "Daily Most Sold on eBay",
  },
] satisfies MarketCategoryDefinition[];
