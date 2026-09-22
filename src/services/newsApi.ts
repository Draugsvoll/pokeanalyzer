import type { NewsFeedsResponse } from "../types/news";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const NEWS_CACHE_KEY = "pokelyzer:news-feeds:v1";
const NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

type NewsApiError = {
  error?: string;
};

export type CachedNewsFeeds = {
  feeds: NewsFeedsResponse;
  isFresh: boolean;
};

export function hasNewsFeeds(feeds: NewsFeedsResponse): boolean {
  return Boolean(feeds.generalNews);
}

export function readCachedNewsFeeds(): CachedNewsFeeds | null {
  try {
    const stored = localStorage.getItem(NEWS_CACHE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as {
      cachedAt?: unknown;
      feeds?: Partial<NewsFeedsResponse>;
      generalNews?: NewsFeedsResponse["generalNews"];
    };
    const storedFeeds = parsed.feeds ?? parsed;
    const generalNews = storedFeeds.generalNews ?? null;
    const validGeneralNews =
      generalNews === null ||
      (typeof generalNews === "object" && Array.isArray(generalNews.items));

    if (!validGeneralNews) return null;

    const feeds = { generalNews };
    if (!hasNewsFeeds(feeds)) return null;

    const cachedAt = typeof parsed.cachedAt === "number" ? parsed.cachedAt : 0;
    return {
      feeds,
      isFresh: cachedAt > 0 && Date.now() - cachedAt < NEWS_CACHE_MAX_AGE_MS,
    };
  } catch {
    return null;
  }
}

export function cacheNewsFeeds(feeds: NewsFeedsResponse): void {
  if (!hasNewsFeeds(feeds)) return;

  try {
    localStorage.setItem(
      NEWS_CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), feeds }),
    );
  } catch {
    // News still renders when browser storage is unavailable.
  }
}

export async function fetchNewsFeeds(
  signal?: AbortSignal,
): Promise<NewsFeedsResponse> {
  const response = await fetch(`${API_URL}/api/news`, {
    cache: "no-store",
    signal,
  });
  const data = (await response.json()) as NewsFeedsResponse & NewsApiError;

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to fetch news");
  }

  return {
    generalNews: data.generalNews ?? null,
  };
}
