import type { Listing } from "../../types/listing.types";

export type ListingSortOption =
  | "newest"
  | "price-low"
  | "price-high";

export function sortListings(
  listings: Listing[],
  sortBy: ListingSortOption
): Listing[] {
  switch (sortBy) {
    case "price-low":
      return [...listings].sort(
        (a, b) => a.price - b.price
      );

    case "price-high":
      return [...listings].sort(
        (a, b) => b.price - a.price
      );

    case "newest":
    default:
      return [...listings].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }
}