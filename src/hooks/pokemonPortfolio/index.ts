import { useNotification } from "../../context/notificationContextValue";
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
  const { showNotification } = useNotification();
  const { upsertPortfolioReference, removePortfolioReference, runMutation } =
    usePortfolioCache();

  const savePokemonToPortfolio = async (card: PokemonCard) => {
    if (!authUser) return false;

    return runMutation("single", card.id, async () => {
      try {
        const response = await addPortfolioCard(card.id, authUser.uid);
        if (
          !upsertPortfolioReference(response.entry, {
            ...card,
            ...response.entry,
            type: "single",
          })
        )
          return false;
        showNotification(
          response.created ? "Added to portfolio" : "Already in portfolio",
        );
        return true;
      } catch (error) {
        logClientError("Failed to save card", error);
        showNotification(
          "We couldn’t save this card. Please try again.",
          "error",
        );
        return false;
      }
    });
  };

  const removePokemonFromPortfolio = async (
    cardId: string,
    requireConfirmation = true,
  ) => {
    if (!authUser) return false;

    return runMutation("single", cardId, async () => {
      if (requireConfirmation) {
        const confirmed = window.confirm(
          "Remove this card from your collection?",
        );
        if (!confirmed) return false;
      }

      try {
        await removePortfolioCard(cardId, authUser.uid);
        if (!removePortfolioReference("single", cardId)) return false;
        showNotification("Removed from portfolio");
        return true;
      } catch (err) {
        logClientError("Failed to remove card", err);
        showNotification(
          "We couldn’t remove this card. Please try again.",
          "error",
        );
        return false;
      }
    });
  };

  const updatePokemonQuantity = async (cardId: string, quantity: number) => {
    if (!authUser || quantity < 1) return false;

    return runMutation("single", cardId, async () => {
      try {
        const entry = await updatePortfolioCardQuantity(
          cardId,
          quantity,
          authUser.uid,
        );
        if (!upsertPortfolioReference(entry)) return false;
        showNotification("Portfolio updated");
        return true;
      } catch (error) {
        logClientError("Failed to update card quantity", error);
        showNotification(
          "We couldn’t update the card quantity. Please try again.",
          "error",
        );
        return false;
      }
    });
  };

  return {
    savePokemonToPortfolio,
    removePokemonFromPortfolio,
    updatePokemonQuantity,
  };
}
