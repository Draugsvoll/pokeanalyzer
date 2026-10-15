import { createContext, useContext } from "react";
import type { PortfolioItemType, PortfolioReference } from "../types/portfolio";
import type { useAssetListCache } from "./useAssetListCache";

type PortfolioCache = ReturnType<typeof useAssetListCache<PortfolioReference>>;

export function portfolioReferenceKey(type: PortfolioItemType, id: string) {
  return `${type}:${id}`;
}

export type PortfolioContextType = {
  runMutation: PortfolioCache["runMutation"];
  isItemUpdating: PortfolioCache["isItemUpdating"];
  items: PortfolioCache["items"];
  missingItems: PortfolioCache["missingItems"];
  hydrate: PortfolioCache["hydrate"];
  portfolioReferences: ReadonlyMap<string, PortfolioReference>;
  portfolioReferencesError: string | null;
  loadingPortfolioReferences: boolean;
  refreshPortfolioReferences: () => Promise<void>;
  replacePortfolioReferences: (entries: PortfolioReference[]) => void;
  upsertPortfolioReference: PortfolioCache["upsertReference"];
  removePortfolioReference: PortfolioCache["removeReference"];
  isItemSaved: (type: PortfolioItemType, id: string) => boolean;
  isCardSaved: (cardId: string) => boolean;
};

export const PortfolioContext = createContext<PortfolioContextType | null>(
  null,
);

export function usePortfolioCache() {
  const context = useContext(PortfolioContext);

  if (!context)
    throw new Error("usePortfolioCache must be used inside PortfolioProvider");

  return context;
}
