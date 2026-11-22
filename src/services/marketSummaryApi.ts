import { isAbortError } from "../hooks/useAbortableRequest";
import type {
  MarketSummaryPayload,
  MarketSummaryResponse,
} from "../types/news";
import {
  isMarketSummaryPayload,
  parseMarketSummaryPayload,
} from "../utils/marketSummaryPayload";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const MARKET_SUMMARY_CACHE_KEY = "pokelyzer:market-summary:v2";
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

async function readJson(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

export async function fetchMarketSummary(
  signal?: AbortSignal,
): Promise<MarketSummaryPayload | null> {
  try {
    const response = await fetch(`${API_URL}/api/market-summary`, {
      cache: "no-store",
      signal,
    });
    const data = (await readJson(response)) as MarketSummaryResponse &
      MarketSummaryApiError;

    if (!response.ok) return null;

    return parseMarketSummaryPayload(data.marketSummary);
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;
    return null;
  }
}
