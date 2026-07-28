import type { NewsFeedsResponse } from "../types/news";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type NewsApiError = {
  error?: string;
};

export async function fetchNewsFeeds(
  signal?: AbortSignal,
): Promise<NewsFeedsResponse> {
  const response = await fetch(`${API_URL}/api/news`, { signal });
  const data = (await response.json()) as NewsFeedsResponse & NewsApiError;

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to fetch news");
  }

  return {
    generalNews: data.generalNews ?? null,
    biggestMovers: data.biggestMovers ?? null,
  };
}
