import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { usePortfolioCache } from "../../context/PortfolioCacheContext";
import type { PokemonCard } from "../../types/pokemon";

export function usePokemonPortfolio() {
  const { user: authUser } = useAuth();
  const { addToPortfolioCache, removeFromPortfolioCache } =
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

  const removePokemonFromPortfolio = async (cardId: string) => {
    if (!authUser) return false;

    const confirmed = window.confirm("Remove this card from your collection?");
    if (!confirmed) return false;

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

  return { savePokemonToPortfolio, removePokemonFromPortfolio };
}
