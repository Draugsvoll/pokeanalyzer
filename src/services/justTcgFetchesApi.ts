import type {
  JustTcgMovementPeriod,
  JustTcgMovementResult,
} from "../types/justTcgMovers";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export type { JustTcgMovementPeriod, JustTcgMovementResult };

type JustTcgMoverCacheKey = "biggestGainers" | "biggestLosers";

const justTcgMoverCache = new Map<string, JustTcgMovementResult[]>();

function getCacheKey(type: JustTcgMoverCacheKey, period: JustTcgMovementPeriod) {
  return `${type}:${period}`;
}

async function fetchJustTcgMovers(
  type: JustTcgMoverCacheKey,
  path: string,
  period: JustTcgMovementPeriod = "7d",
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
) {
  const cacheKey = getCacheKey(type, period);
  if (!options.forceRefresh && justTcgMoverCache.has(cacheKey)) {
    return justTcgMoverCache.get(cacheKey) ?? [];
  }

  const params = new URLSearchParams({ period });
  const response = await fetch(`${API_URL}${path}?${params}`, {
    signal: options.signal,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message ?? "Failed to fetch JustTCG cards");
  }

  const payload = (await response.json()) as { cards?: JustTcgMovementResult[] };
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  justTcgMoverCache.set(cacheKey, cards);
  return cards;
}

export async function fetchJustTcgBiggestGainers(
  signal?: AbortSignal,
  period: JustTcgMovementPeriod = "7d",
  options: { forceRefresh?: boolean } = {},
) {
  return fetchJustTcgMovers(
    "biggestGainers",
    "/api/justtcg/biggest-gainers",
    period,
    { ...options, signal },
  );
}

export async function fetchJustTcgBiggestLosers(
  signal?: AbortSignal,
  period: JustTcgMovementPeriod = "7d",
  options: { forceRefresh?: boolean } = {},
) {
  return fetchJustTcgMovers(
    "biggestLosers",
    "/api/justtcg/biggest-losers",
    period,
    { ...options, signal },
  );
}
