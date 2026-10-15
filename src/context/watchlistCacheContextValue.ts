import { createContext, useContext } from "react";
import type { useAssetListCache } from "./useAssetListCache";
import type { WatchlistReference } from "../types/watchlist";

export const WatchlistContext = createContext<ReturnType<
  typeof useAssetListCache<WatchlistReference>
> | null>(null);
export function useWatchlistCache() {
  const context = useContext(WatchlistContext);
  if (!context)
    throw new Error("useWatchlistCache must be used inside WatchlistProvider");
  return context;
}
