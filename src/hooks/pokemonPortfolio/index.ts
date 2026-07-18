import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import {
  addPortfolioCard,
  removePortfolioCard,
  updatePortfolioCardQuantity,
} from "../../services/portfolioApi";

export function usePokemonPortfolio() {
  const { user: authUser } = useAuth();
  const { addToPortfolioCache, removeFromPortfolioCache, updatePortfolioQuantityCache } =
    usePortfolioCache();

  const savePokemonToPortfolio = async (card: PokemonCard) => {
    if (!authUser) return false;

    try {
      const response = await addPortfolioCard(card.id);
      addToPortfolioCache(response.card);
      return true;
    } catch (error) {
      logClientError("Failed to save card", error);
      alert("Failed to save card.");
      return false;
    }
  };

  const removePokemonFromPortfolio = async (
    cardId: string,
    requireConfirmation = true
  ) => {
    if (!authUser) return false;

    if (requireConfirmation) {
      const confirmed = window.confirm("Remove this card from your collection?");
      if (!confirmed) return false;
    }

    try {
      await removePortfolioCard(cardId);
      removeFromPortfolioCache(cardId);
      return true;
    } catch (err) {
      logClientError("Failed to remove card", err);
      alert("Failed to remove card.");
      return false;
    }
  };

  const updatePokemonQuantity = async (cardId: string, quantity: number) => {
    if (!authUser || quantity < 1) return false;

    try {
      await updatePortfolioCardQuantity(cardId, quantity);
      updatePortfolioQuantityCache(cardId, quantity);
      return true;
    } catch (error) {
      logClientError("Failed to update card quantity", error);
      alert("Failed to update card quantity.");
      return false;
    }
  };

  return { savePokemonToPortfolio, removePokemonFromPortfolio, updatePokemonQuantity };
}
