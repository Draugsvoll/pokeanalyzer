import type { EbayCredits } from "./ebayCredits.js";
export type MarketplaceSide = "sold" | "active";
export type MarketplaceStatus = "pending" | "success" | "error";
export type MarketplaceSearchEvent<T> =
  | { type: "started" | "complete"; credits: EbayCredits }
  | { type: "result"; side: MarketplaceSide; data: T }
  | { type: "failure"; side: MarketplaceSide; message: string }
  | { type: "error"; message: string };
