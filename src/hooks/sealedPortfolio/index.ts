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
  const { upsertPortfolioReference, removePortfolioReference } =
    usePortfolioCache();

  const saveSealedToPortfolio = async (
    product: PokeTraceSealedCatalogProduct,
  ) => {
    if (!authUser) return false;

    try {
      const response = await addPortfolioItem(
        "sealed",
        product.id,
        authUser.uid,
      );
      upsertPortfolioReference(response.entry);
      return true;
    } catch (error) {
      logClientError("Failed to save sealed product", error);
      alert("We couldn't save this sealed product. Please try again.");
      return false;
    }
  };

  const removeSealedFromPortfolio = async (
    productId: string,
    requireConfirmation = true,
  ) => {
    if (!authUser) return false;
    if (
      requireConfirmation &&
      !window.confirm("Remove this sealed product from your collection?")
    ) {
      return false;
    }

    try {
      await removePortfolioItem("sealed", productId, authUser.uid);
      removePortfolioReference("sealed", productId);
      return true;
    } catch (error) {
      logClientError("Failed to remove sealed product", error);
      alert("We couldn't remove this sealed product. Please try again.");
      return false;
    }
  };

  const updateSealedQuantity = async (productId: string, quantity: number) => {
    if (!authUser || quantity < 1) return false;

    try {
      const entry = await updatePortfolioItemQuantity(
        "sealed",
        productId,
        quantity,
        authUser.uid,
      );
      upsertPortfolioReference(entry);
      return true;
    } catch (error) {
      logClientError("Failed to update sealed product quantity", error);
      alert(
        "We couldn't update the sealed product quantity. Please try again.",
      );
      return false;
    }
  };

  return {
    saveSealedToPortfolio,
    removeSealedFromPortfolio,
    updateSealedQuantity,
  };
}
