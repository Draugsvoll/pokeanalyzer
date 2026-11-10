import type { EbayCredits } from "./ebayCredits.js";
export type MarketplaceSide = "sold" | "active";
export type MarketplaceStatus = "pending" | "success" | "error";
export type MarketplaceSearchEvent<T> =
  | { type: "started" | "complete"; credits: EbayCredits }
  | { type: "result"; side: MarketplaceSide; data: T }
  | {
      type: "failure";
      side: MarketplaceSide;
      message: string;
      rateLimited?: boolean;
    }
  | { type: "error"; message: string };

export const MARKETPLACE_RATE_LIMIT_MESSAGE =
  "Experiencing issues right now. Please try again later.";
