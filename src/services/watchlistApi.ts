import { savedListRequest } from "./savedListApi";
import { runWithRequestTimeout } from "../utils/requestTimeout";
import type {
  WatchlistReference,
  HydratedWatchlistResponse,
} from "../types/watchlist";

export function getWatchlistReferences(uid: string) {
  return savedListRequest<{ entries: WatchlistReference[] }>(
    "watchlist",
    "/assets",
    uid,
  );
}
export function getHydratedWatchlist(uid: string, signal?: AbortSignal) {
  return runWithRequestTimeout(
    (requestSignal) =>
      savedListRequest<HydratedWatchlistResponse>(
        "watchlist",
        "/assets/hydrated",
        uid,
        { signal: requestSignal },
      ),
    { signal },
  );
}
export function addWatchlistItem(
  type: WatchlistReference["type"],
  id: string,
  uid: string,
) {
  return savedListRequest<{ created: boolean; entry: WatchlistReference }>(
    "watchlist",
    "/assets",
    uid,
    {
      method: "POST",
      body: JSON.stringify({ id, type }),
    },
  );
}
export function removeWatchlistItem(
  type: WatchlistReference["type"],
  id: string,
  uid: string,
) {
  return savedListRequest<void>(
    "watchlist",
    `/assets/${type}/${encodeURIComponent(id)}`,
    uid,
    { method: "DELETE" },
  );
}
