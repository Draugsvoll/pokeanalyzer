import {
  parsePokeTraceFilterOptions,
  type PokeTraceFilterOptions,
} from "../../shared/pokeTraceFilterOptions";
import { logClientError } from "../utils/logClientError";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const FILTER_OPTIONS_URL = `${API_URL}/api/cards/filter-options?v=2`;
const CACHE_KEY = "pokelyzer:poketrace-filter-options:v2";
export const POKETRACE_FILTER_OPTIONS_CACHE_MS = 24 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

type StoredFilterOptions = {
  cachedAt: number;
  options: PokeTraceFilterOptions;
};

let memoryCache: StoredFilterOptions | null = null;
let requestPromise: Promise<PokeTraceFilterOptions | null> | null = null;

function parseStored(value: string | null): StoredFilterOptions | null {
  if (!value) return null;
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (typeof parsed.cachedAt !== "number") return null;
  return {
    cachedAt: parsed.cachedAt,
    options: parsePokeTraceFilterOptions(parsed.options),
  };
}

function loadStored() {
  if (memoryCache) return memoryCache;
  try {
    memoryCache = parseStored(localStorage.getItem(CACHE_KEY));
  } catch (error) {
    logClientError("Failed to read cached PokeTrace filter options", error);
  }
  return memoryCache;
}

function isFresh(cache: StoredFilterOptions, now: number) {
  return (
    cache.cachedAt <= now + MAX_CLOCK_SKEW_MS &&
    now - cache.cachedAt < POKETRACE_FILTER_OPTIONS_CACHE_MS
  );
}

function saveStored(options: PokeTraceFilterOptions) {
  const cache = { cachedAt: Date.now(), options };
  memoryCache = cache;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    logClientError("Failed to cache PokeTrace filter options", error);
  }
}

export async function loadPokeTraceFilterOptions() {
  const stored = loadStored();
  if (stored && isFresh(stored, Date.now())) return stored.options;
  if (requestPromise) return requestPromise;

  requestPromise = fetch(FILTER_OPTIONS_URL)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Filter options request failed (${response.status})`);
      }
      const options = parsePokeTraceFilterOptions(
        (await response.json()) as unknown,
      );
      saveStored(options);
      return options;
    })
    .catch((error: unknown) => {
      logClientError("Failed to load PokeTrace filter options", error);
      return stored?.options ?? null;
    })
    .finally(() => {
      requestPromise = null;
    });

  return requestPromise;
}
