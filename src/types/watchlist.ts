import type {
  PortfolioReference,
  PortfolioSingle,
  PortfolioSealedProduct,
} from "./portfolio";

export type WatchlistReference = Omit<PortfolioReference, "quantity">;
export type WatchlistItem =
  Omit<PortfolioSingle, "quantity"> | Omit<PortfolioSealedProduct, "quantity">;
export type HydratedWatchlistResponse = {
  entries: WatchlistReference[];
  items: WatchlistItem[];
  missingItems: WatchlistReference[];
};
