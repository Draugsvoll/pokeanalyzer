import type { PokemonCard } from "../types/pokemon";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const NEW_RELEASES_CACHE_KEY = "most-expensive-new-releases-v1";
const NEW_RELEASES_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDisplayableCard(value: unknown): value is PokemonCard {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isRecord(value.set) &&
    typeof value.set.name === "string" &&
    typeof value.set.releaseDate === "string" &&
    isRecord(value.images) &&
    typeof value.images.small === "string"
  );
}

export function parseMostExpensiveNewReleases(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.cards)) {
    throw new Error("Invalid new-release response");
  }

  if (!value.cards.every(isDisplayableCard)) {
    throw new Error("Invalid card in new-release response");
  }

  return value.cards;
}

function readCachedMostExpensiveNewReleases() {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(NEW_RELEASES_CACHE_KEY);
    if (!stored) return null;

    const cached: unknown = JSON.parse(stored);
    if (!isRecord(cached) || typeof cached.cachedAt !== "number") return null;

    const age = Date.now() - cached.cachedAt;
    if (age < 0 || age >= NEW_RELEASES_CACHE_MAX_AGE_MS) return null;

    const cards = parseMostExpensiveNewReleases({ cards: cached.cards });
    return cards.length > 0 ? cards : null;
  } catch {
    return null;
  }
}

function cacheMostExpensiveNewReleases(cards: PokemonCard[]) {
  if (typeof window === "undefined" || cards.length === 0) return;

  try {
    window.localStorage.setItem(
      NEW_RELEASES_CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), cards }),
    );
  } catch {
    // Browser storage can be unavailable or full; the API remains the fallback.
  }
}

export async function fetchMostExpensiveNewReleases(signal?: AbortSignal) {
  const cached = readCachedMostExpensiveNewReleases();
  if (cached) return cached;

  const response = await fetch(
    `${API_URL}/api/cards/most-expensive-new-releases`,
    { signal },
  );
  if (!response.ok) throw new Error("New releases are unavailable");
  const cards = parseMostExpensiveNewReleases(await response.json());
  cacheMostExpensiveNewReleases(cards);
  return cards;
}
