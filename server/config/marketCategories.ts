import type { GradingOpportunitiesOptions } from "../services/gradingOpportunities.js";
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

type GradingOpportunitiesCategoryDefinition = {
  id: string;
  parameters: Partial<GradingOpportunitiesOptions>;
  query: "gradingOpportunities";
  title: string;
};

export type MarketCategoryDefinition =
  | GradingOpportunitiesCategoryDefinition
  | MostSoldCategoryDefinition
  | PriceMoversCategoryDefinition;

// Add or duplicate entries here to export more categories in the same JSON file.
export const MARKET_CATEGORY_DEFINITIONS = [
  {
    id: "daily-tcg-near-mint-gainers",
    parameters: {
      condition: "NEAR_MINT",
      direction: "gainers",
      limit: 12,
      minimumChange: 0,
      minimumChangePercent: 0,
      minimumPrice: 20,
      minimumSales: 200,
      minimumSalesIncrease: 2,
      periodDays: 1,
      useCachedOneDayComparison: true,
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
      limit: 12,
      minimumChange: 0,
      minimumChangePercent: 0,
      minimumPrice: 20,
      minimumSales: 200,
      minimumSalesIncrease: 2,
      periodDays: 1,
      useCachedOneDayComparison: true,
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
      limit: 12,
      minimumPrice: 20,
      minimumNewSales: 1,
      requireThreeSnapshotIncrease: true,
      source: "tcgplayer",
    },
    query: "mostSold",
    title: "TCG high volume this week",
  },
  {
    id: "most-sold-ebay",
    parameters: {
      condition: "NEAR_MINT",
      limit: 12,
      minimumPrice: 20,
      minimumNewSales: 1,
      minimumSaleCount: 150,
      requireThreeSnapshotIncrease: true,
      source: "ebay",
    },
    query: "mostSold",
    title: "Ebay high volume this week",
  },
  {
    id: "grading-opportunities",
    parameters: {
      limit: 12,
      maximumUpdateAgeDays: 30,
      minimumNearMintPrice: 0,
      minimumNearMintSales: 75,
      minimumPsaPriceIncrease: 500,
      minimumPsaSales: 75,
    },
    query: "gradingOpportunities",
    title: "Grading Opportunities",
  },
] satisfies MarketCategoryDefinition[];
