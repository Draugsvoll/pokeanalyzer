import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import type { PokemonCard } from "../../types/pokemon";

export function usePokemonPortfolio() {
  const { user: authUser } = useAuth();
  const { addToPortfolioCache, removeFromPortfolioCache, updatePortfolioQuantityCache } =
    usePortfolioCache();

  const savePokemonToPortfolio = async (card: PokemonCard) => {
    if (!authUser) return false;

    try {
      await setDoc(
        doc(db, "users", authUser.uid, "portfolio", card.id),
        card,
        { merge: true }
      );
      addToPortfolioCache(card);
      return true;
    } catch (error) {
      console.error("Failed to save card:", error);
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
      await deleteDoc(doc(db, "users", authUser.uid, "portfolio", cardId));
      removeFromPortfolioCache(cardId);
      return true;
    } catch (err) {
      console.error(err);
      alert("Failed to remove card.");
      return false;
    }
  };

  const updatePokemonQuantity = async (cardId: string, quantity: number) => {
    if (!authUser || quantity < 1) return false;

    try {
      await setDoc(
        doc(db, "users", authUser.uid, "portfolio", cardId),
        { quantity },
        { merge: true }
      );
      updatePortfolioQuantityCache(cardId, quantity);
      return true;
    } catch (error) {
      console.error("Failed to update card quantity:", error);
      alert("Failed to update card quantity.");
      return false;
    }
  };

  return { savePokemonToPortfolio, removePokemonFromPortfolio, updatePokemonQuantity };
}
