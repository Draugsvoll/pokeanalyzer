import { useNotification } from "../../context/notificationContextValue";
import type { PokeTraceSealedCatalogProduct } from "../../../shared/pokeTraceSealed";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import {
  addPortfolioItem,
  removePortfolioItem,
  updatePortfolioItemQuantity,
} from "../../services/portfolioApi";
import { logClientError } from "../../utils/logClientError";

export function useSealedPortfolio() {
  const { user: authUser } = useAuth();
  const { showNotification } = useNotification();
  const { upsertPortfolioReference, removePortfolioReference, runMutation } =
    usePortfolioCache();

  const saveSealedToPortfolio = async (
    product: PokeTraceSealedCatalogProduct,
  ) => {
    if (!authUser) return false;

    return runMutation("sealed", product.id, async () => {
      try {
        const response = await addPortfolioItem(
          "sealed",
          product.id,
          authUser.uid,
        );
        if (
          !upsertPortfolioReference(response.entry, {
            ...product,
            ...response.entry,
            type: "sealed",
          })
        )
          return false;
        showNotification(
          response.created ? "Added to portfolio" : "Already in portfolio",
        );
        return true;
      } catch (error) {
        logClientError("Failed to save sealed product", error);
        showNotification(
          "We couldn't save this sealed product. Please try again.",
          "error",
        );
        return false;
      }
    });
  };

  const removeSealedFromPortfolio = async (
    productId: string,
    requireConfirmation = true,
  ) => {
    if (!authUser) return false;

    return runMutation("sealed", productId, async () => {
      if (
        requireConfirmation &&
        !window.confirm("Remove this sealed product from your collection?")
      ) {
        return false;
      }

      try {
        await removePortfolioItem("sealed", productId, authUser.uid);
        if (!removePortfolioReference("sealed", productId)) return false;
        showNotification("Removed from portfolio");
        return true;
      } catch (error) {
        logClientError("Failed to remove sealed product", error);
        showNotification(
          "We couldn't remove this sealed product. Please try again.",
          "error",
        );
        return false;
      }
    });
  };

  const updateSealedQuantity = async (productId: string, quantity: number) => {
    if (!authUser || quantity < 1) return false;

    return runMutation("sealed", productId, async () => {
      try {
        const entry = await updatePortfolioItemQuantity(
          "sealed",
          productId,
          quantity,
          authUser.uid,
        );
        if (!upsertPortfolioReference(entry)) return false;
        showNotification("Portfolio updated");
        return true;
      } catch (error) {
        logClientError("Failed to update sealed product quantity", error);
        showNotification(
          "We couldn't update the sealed product quantity. Please try again.",
          "error",
        );
        return false;
      }
    });
  };

  return {
    saveSealedToPortfolio,
    removeSealedFromPortfolio,
    updateSealedQuantity,
  };
}
