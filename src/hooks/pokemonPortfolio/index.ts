import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import type { PokemonCard } from "../../types/pokemon";
import type { PortfolioPriceSource } from "../../types/portfolio";
import { logClientError } from "../../utils/logClientError";
import {
  addPortfolioCard,
  ensurePortfolioJustTcgLookup,
  removePortfolioCard,
  updatePortfolioCardPriceSource,
  updatePortfolioCardQuantity,
} from "../../services/portfolioApi";

export function usePokemonPortfolio() {
  const { user: authUser } = useAuth();
  const { upsertPortfolioReference, removePortfolioReference } =
    usePortfolioCache();

  const savePokemonToPortfolio = async (card: PokemonCard) => {
    if (!authUser) return false;

    try {
      const response = await addPortfolioCard(card.id, authUser.uid);
      upsertPortfolioReference(response.entry);
      void ensurePortfolioJustTcgLookup(card.id, authUser.uid).catch(
        (error) => {
          logClientError(
            "Failed to enrich portfolio card with JustTCG ID",
            error,
          );
        },
      );
      return true;
    } catch (error) {
      logClientError("Failed to save card", error);
      alert("Failed to save card.");
      return false;
    }
  };

  const removePokemonFromPortfolio = async (
    cardId: string,
    requireConfirmation = true,
  ) => {
    if (!authUser) return false;

    if (requireConfirmation) {
      const confirmed = window.confirm(
        "Remove this card from your collection?",
      );
      if (!confirmed) return false;
    }

    try {
      await removePortfolioCard(cardId, authUser.uid);
      removePortfolioReference(cardId);
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
      const entry = await updatePortfolioCardQuantity(
        cardId,
        quantity,
        authUser.uid,
      );
      upsertPortfolioReference(entry);
      return true;
    } catch (error) {
      logClientError("Failed to update card quantity", error);
      alert("Failed to update card quantity.");
      return false;
    }
  };

  const updatePokemonPriceSource = async (
    cardId: string,
    priceSource: PortfolioPriceSource,
    priceKey: string,
    selectForAll = false,
  ) => {
    if (!authUser || !priceKey.trim()) return false;

    try {
      const entry = await updatePortfolioCardPriceSource(
        cardId,
        priceSource,
        priceKey,
        selectForAll,
        authUser.uid,
      );
      upsertPortfolioReference(entry);
      return true;
    } catch (error) {
      logClientError("Failed to update card price source", error);
      alert("Failed to update price source.");
      return false;
    }
  };

  return {
    savePokemonToPortfolio,
    removePokemonFromPortfolio,
    updatePokemonQuantity,
    updatePokemonPriceSource,
  };
}
