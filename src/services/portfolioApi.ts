import type {
  AddPortfolioCardResponse,
  HydratedPortfolioResponse,
  PortfolioPriceSource,
  PortfolioReference,
  PortfolioReferencesResponse,
} from "../types/portfolio";
import { authenticatedFetch } from "../utils/authenticatedFetch";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function portfolioRequest<T>(
  path: string,
  expectedUid: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await authenticatedFetch(
    `${API_URL}/api/portfolio${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    },
    expectedUid,
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(
      error.message || `Portfolio request failed: ${response.status}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getPortfolioReferences(expectedUid: string) {
  return portfolioRequest<PortfolioReferencesResponse>("/cards", expectedUid);
}

export function getHydratedPortfolio(
  expectedUid: string,
  signal?: AbortSignal,
) {
  return portfolioRequest<HydratedPortfolioResponse>(
    "/cards/hydrated",
    expectedUid,
    { signal },
  );
}

export function addPortfolioCard(cardId: string, expectedUid: string) {
  return portfolioRequest<AddPortfolioCardResponse>("/cards", expectedUid, {
    method: "POST",
    body: JSON.stringify({ cardId }),
  });
}

export function ensurePortfolioJustTcgLookup(
  cardId: string,
  expectedUid: string,
) {
  return portfolioRequest<unknown>(
    `/cards/${encodeURIComponent(cardId)}/justtcg-lookup`,
    expectedUid,
    { method: "POST" },
  );
}

export function getPortfolioJustTcgPrices(
  expectedUid: string,
  signal?: AbortSignal,
) {
  return portfolioRequest<{
    cards: Array<{
      cardId: string;
      justtcg: HydratedPortfolioResponse["cards"][number]["justtcg"] | null;
    }>;
    missingCardIds: string[];
    portfolioJustTcgPricesFetchedAt?: string;
  }>("/cards/justtcg-prices", expectedUid, { signal });
}

export function fillMissingPortfolioJustTcgData(
  cardIds: string[],
  expectedUid: string,
  signal?: AbortSignal,
) {
  return portfolioRequest<{
    cards: Array<{
      cardId: string;
      justtcg: HydratedPortfolioResponse["cards"][number]["justtcg"] | null;
    }>;
    missingCardIds: string[];
    portfolioJustTcgPricesFetchedAt?: string;
  }>("/cards/justtcg-fill-missing", expectedUid, {
    method: "POST",
    body: JSON.stringify({ cardIds }),
    signal,
  });
}

export function removePortfolioCard(cardId: string, expectedUid: string) {
  return portfolioRequest<void>(
    `/cards/${encodeURIComponent(cardId)}`,
    expectedUid,
    { method: "DELETE" },
  );
}

export function updatePortfolioCardQuantity(
  cardId: string,
  quantity: number,
  expectedUid: string,
) {
  return portfolioRequest<PortfolioReference>(
    `/cards/${encodeURIComponent(cardId)}/quantity`,
    expectedUid,
    {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    },
  );
}

export function updatePortfolioCardPriceSource(
  cardId: string,
  priceSource: PortfolioPriceSource,
  priceKey: string,
  selectForAll: boolean,
  expectedUid: string,
) {
  return portfolioRequest<PortfolioReference>(
    `/cards/${encodeURIComponent(cardId)}/price-source`,
    expectedUid,
    {
      method: "PATCH",
      body: JSON.stringify({ priceSource, priceKey, selectForAll }),
    },
  );
}
