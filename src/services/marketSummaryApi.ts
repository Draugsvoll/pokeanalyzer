import type {
  MarketSummaryPayload,
  MarketSummaryResponse,
} from "../types/news";
import { isMarketSummaryPayload } from "../utils/marketSummaryPayload";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const MARKET_SUMMARY_CACHE_KEY = "pokelyzer:market-summary:v1";
const MARKET_SUMMARY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

type MarketSummaryApiError = {
  error?: string;
};

export type CachedMarketSummary = {
  marketSummary: MarketSummaryPayload;
  isFresh: boolean;
};

export function readCachedMarketSummary(): CachedMarketSummary | null {
  try {
    const stored = localStorage.getItem(MARKET_SUMMARY_CACHE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as {
      cachedAt?: unknown;
      marketSummary?: unknown;
    };
    if (!isMarketSummaryPayload(parsed.marketSummary)) return null;

    const cachedAt = typeof parsed.cachedAt === "number" ? parsed.cachedAt : 0;
    return {
      marketSummary: parsed.marketSummary,
      isFresh:
        cachedAt > 0 && Date.now() - cachedAt < MARKET_SUMMARY_CACHE_MAX_AGE_MS,
    };
  } catch {
    return null;
  }
}

export function cacheMarketSummary(marketSummary: MarketSummaryPayload): void {
  if (!isMarketSummaryPayload(marketSummary)) return;

  try {
    localStorage.setItem(
      MARKET_SUMMARY_CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), marketSummary }),
    );
  } catch {
    // The summary still renders when browser storage is unavailable.
  }
}

export async function fetchMarketSummary(
  signal?: AbortSignal,
): Promise<MarketSummaryPayload | null> {
  const response = await fetch(`${API_URL}/api/market-summary`, {
    cache: "no-store",
    signal,
  });
  const data = (await response.json()) as MarketSummaryResponse &
    MarketSummaryApiError;

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to fetch market summary");
  }

  return isMarketSummaryPayload(data.marketSummary) ? data.marketSummary : null;
}
