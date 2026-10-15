import type { ReactNode } from "react";
import { PortfolioContext } from "./portfolioCacheContextValue";
import { useAssetListCache } from "./useAssetListCache";
import { getPortfolioReferences } from "../services/portfolioApi";

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const cache = useAssetListCache(getPortfolioReferences);
  return (
    <PortfolioContext.Provider
      value={{
        runMutation: cache.runMutation,
        isItemUpdating: cache.isItemUpdating,
        items: cache.items,
        missingItems: cache.missingItems,
        hydrate: cache.hydrate,
        portfolioReferences: cache.references,
        portfolioReferencesError: cache.referencesError,
        loadingPortfolioReferences: cache.loadingReferences,
        refreshPortfolioReferences: cache.refreshReferences,
        replacePortfolioReferences: cache.replaceReferences,
        upsertPortfolioReference: cache.upsertReference,
        removePortfolioReference: cache.removeReference,
        isItemSaved: cache.isItemSaved,
        isCardSaved: cache.isCardSaved,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}
