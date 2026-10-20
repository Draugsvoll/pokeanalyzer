import type { EbayCredits } from "./ebayCredits.js";

export type EbayListingType = "sold" | "active";
export type EbayListingStatus = "pending" | "success" | "error";
export type EbayListings = Record<string, unknown> & { items: unknown[] };

export type EbaySearchEvent =
  | { type: "started"; credits: EbayCredits }
  | { type: "result"; side: EbayListingType; data: EbayListings }
  | { type: "failure"; side: EbayListingType; message: string }
  | { type: "complete"; credits: EbayCredits }
  | { type: "error"; message: string };

export function isEbayListings(value: unknown): value is EbayListings {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "items" in value &&
    Array.isArray(value.items)
  );
}
