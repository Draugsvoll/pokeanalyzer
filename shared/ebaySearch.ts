import type {
  MarketplaceSearchEvent,
  MarketplaceSide,
  MarketplaceStatus,
} from "./marketplaceSearch.js";
export type EbayListingType = MarketplaceSide;
export type EbayListingStatus = MarketplaceStatus;
export type EbayListings = Record<string, unknown> & { items: unknown[] };
export type EbaySearchEvent = MarketplaceSearchEvent<EbayListings>;

export function isEbayListings(value: unknown): value is EbayListings {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "items" in value &&
    Array.isArray(value.items)
  );
}
