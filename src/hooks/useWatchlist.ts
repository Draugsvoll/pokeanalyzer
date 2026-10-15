import { useAuth } from "../context/authContextValue";
import { useWatchlistCache } from "../context/watchlistCacheContextValue";
import { useNotification } from "../context/notificationContextValue";
import {
  addWatchlistItem,
  removeWatchlistItem,
} from "../services/watchlistApi";
import type { WatchlistItem } from "../types/watchlist";
import { logClientError } from "../utils/logClientError";

export function useWatchlist() {
  const { user } = useAuth();
  const { upsertReference, removeReference, runMutation } = useWatchlistCache();
  const { showNotification } = useNotification();

  async function setWatched(item: WatchlistItem, saved: boolean) {
    if (!user) return false;
    const { type, id } = item;
    return runMutation(type, id, async () => {
      try {
        if (saved) {
          const result = await addWatchlistItem(type, id, user.uid);
          if (
            !upsertReference(result.entry, {
              ...item,
              id: result.entry.id,
              quantity: 1,
            })
          )
            return false;
          showNotification(
            result.created ? "Added to watchlist" : "Already in watchlist",
          );
        } else {
          await removeWatchlistItem(type, id, user.uid);
          if (!removeReference(type, id)) return false;
          showNotification("Removed from watchlist");
        }
        return true;
      } catch (error) {
        logClientError("Failed to update watchlist", error);
        showNotification(
          "We couldn't update your watchlist. Please try again.",
          "error",
        );
        return false;
      }
    });
  }
  return { setWatched };
}
