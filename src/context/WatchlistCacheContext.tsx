import type { ReactNode } from "react";
import { WatchlistContext } from "./watchlistCacheContextValue";
import { useAssetListCache } from "./useAssetListCache";
import { getWatchlistReferences } from "../services/watchlistApi";

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const cache = useAssetListCache(getWatchlistReferences);
  return (
    <WatchlistContext.Provider value={cache}>
      {children}
    </WatchlistContext.Provider>
  );
}
