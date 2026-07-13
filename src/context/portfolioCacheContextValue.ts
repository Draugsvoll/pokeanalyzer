import { createContext, useContext } from "react";
import type { PokemonCard } from "../types/pokemon";

export type PortfolioContextType = {
  portfolio: PokemonCard[];
  loadingPortfolio: boolean;
  initPortfolio: () => Promise<void>;
  addToPortfolioCache: (card: PokemonCard) => void;
  removeFromPortfolioCache: (cardId: string) => void;
  updatePortfolioQuantityCache: (cardId: string, quantity: number) => void;
  isCardSaved: (cardId: string) => boolean;
};

export const PortfolioContext = createContext<PortfolioContextType | null>(null);

export function usePortfolioCache() {
  const context = useContext(PortfolioContext);

  if (!context) throw new Error("usePortfolioCache must be used inside PortfolioProvider");

  return context;
}
