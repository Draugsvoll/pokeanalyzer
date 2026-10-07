import { createContext, useContext } from "react";
import type { PortfolioItemType, PortfolioReference } from "../types/portfolio";

export function portfolioReferenceKey(type: PortfolioItemType, id: string) {
  return `${type}:${id}`;
}

export type PortfolioContextType = {
  portfolioReferences: ReadonlyMap<string, PortfolioReference>;
  portfolioReferencesError: string | null;
  loadingPortfolioReferences: boolean;
  refreshPortfolioReferences: () => Promise<void>;
  replacePortfolioReferences: (entries: PortfolioReference[]) => void;
  upsertPortfolioReference: (entry: PortfolioReference) => void;
  removePortfolioReference: (type: PortfolioItemType, id: string) => void;
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
