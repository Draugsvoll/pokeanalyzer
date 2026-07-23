import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./authContextValue";
import { PortfolioContext } from "./portfolioCacheContextValue";
import { getPortfolioCacheKey } from "../utils/cache";
import type { PokemonCard } from "../types/pokemon";
import { logClientError } from "../utils/logClientError";


export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();

  const [portfolio, setPortfolio] = useState<PokemonCard[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  const savePortfolioToCache = useCallback((updatedPortfolio: PokemonCard[]) => {
    if (!authUser) return;

    const cacheKey = getPortfolioCacheKey(authUser.uid);
    localStorage.setItem(cacheKey, JSON.stringify(updatedPortfolio));
  }, [authUser]);

  const initPortfolio = useCallback(async () => {
    if (!authUser) {
      setPortfolio([]);
      setLoadingPortfolio(false);
      return;
    }

    try {
      setLoadingPortfolio(true);

      const portfolioRef = collection(db, "users", authUser.uid, "portfolio");
      const portfolioSnap = await getDocs(portfolioRef);

      const portfolioCards = portfolioSnap.docs.map((doc) => ({
        ...(doc.data() as Omit<PokemonCard, "id">),
        id: doc.id,
      }));

      setPortfolio(portfolioCards);
      savePortfolioToCache(portfolioCards);
    } catch (error) {
      logClientError("Failed to refresh portfolio", error);
      setPortfolio([]);
    } finally {
      setLoadingPortfolio(false);
    }
  }, [authUser, savePortfolioToCache]);

  const addToPortfolioCache = (card: PokemonCard) => {
    const updatedPortfolio = [
      ...portfolio.filter((item) => item.id !== card.id),
      card,
    ];

    setPortfolio(updatedPortfolio);
    savePortfolioToCache(updatedPortfolio);
  };

  const removeFromPortfolioCache = (cardId: string) => {
    const updatedPortfolio = portfolio.filter((card) => card.id !== cardId);
    setPortfolio(updatedPortfolio);
    savePortfolioToCache(updatedPortfolio);
  };

  const updatePortfolioQuantityCache = (cardId: string, quantity: number) => {
    const updatedPortfolio = portfolio.map((card) =>
      card.id === cardId ? { ...card, quantity } : card
    );
    setPortfolio(updatedPortfolio);
    savePortfolioToCache(updatedPortfolio);
  };

  const updatePortfolioPriceSourceCache = (
    cardId: string,
    priceSource: string,
  ) => {
    const updatedPortfolio = portfolio.map((card) =>
      card.id === cardId ? { ...card, priceSource } : card
    );
    setPortfolio(updatedPortfolio);
    savePortfolioToCache(updatedPortfolio);
  };

  const isCardSaved = (cardId: string) => {
    return portfolio.some((card) => card.id === cardId);
  };

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      void initPortfolio();
    }, 0);

    return () => window.clearTimeout(initialize);
  }, [initPortfolio]);

  return (
    <PortfolioContext.Provider
      value={{
        portfolio,
        loadingPortfolio,
        initPortfolio,
        addToPortfolioCache,
        removeFromPortfolioCache,
        updatePortfolioQuantityCache,
        updatePortfolioPriceSourceCache,
        isCardSaved,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}
