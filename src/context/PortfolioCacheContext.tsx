import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { getPortfolioCacheKey } from "../utils/cache";
import type { PokemonCard } from "../types/pokemon";


type PortfolioContextType = {
  portfolio: PokemonCard[];
  loadingPortfolio: boolean;
  initPortfolio: () => Promise<void>;
  addToPortfolioCache: (card: PokemonCard ) => void;
  removeFromPortfolioCache: (cardId: string) => void;
  isCardSaved: (cardId: string) => boolean;
};


const PortfolioContext = createContext<PortfolioContextType | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();

  const [portfolio, setPortfolio] = useState<PokemonCard[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  const savePortfolioToCache = (updatedPortfolio: PokemonCard[]) => {
    if (!authUser) return;

    const cacheKey = getPortfolioCacheKey(authUser.uid);
    localStorage.setItem(cacheKey, JSON.stringify(updatedPortfolio));
  };

  const initPortfolio = async () => {
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
      console.error("Failed to refresh portfolio:", error);
      setPortfolio([]);
    } finally {
      setLoadingPortfolio(false);
    }
  };

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

  const isCardSaved = (cardId: string) => {
    return portfolio.some((card) => card.id === cardId);
  };

  useEffect(() => {
    initPortfolio();
  }, [authUser]);

  return (
    <PortfolioContext.Provider
      value={{
        portfolio,
        loadingPortfolio,
        initPortfolio,
        addToPortfolioCache,
        removeFromPortfolioCache,
        isCardSaved,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolioCache() {
  const context = useContext(PortfolioContext);

  if (!context) {
    throw new Error("usePortfolio must be used inside PortfolioProvider");
  }

  return context;
}
