import type {
  AddPortfolioItemResponse,
  HydratedPortfolioResponse,
  PortfolioItemType,
  PortfolioReference,
  PortfolioReferencesResponse,
} from "../types/portfolio";
import { authenticatedFetch } from "../utils/authenticatedFetch";
import { runWithRequestTimeout } from "../utils/requestTimeout";

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
  return portfolioRequest<PortfolioReferencesResponse>("/assets", expectedUid);
}

export function getHydratedPortfolio(
  expectedUid: string,
  signal?: AbortSignal,
) {
  return runWithRequestTimeout(
    (requestSignal) =>
      portfolioRequest<HydratedPortfolioResponse>(
        "/assets/hydrated",
        expectedUid,
        { signal: requestSignal },
      ),
    { signal },
  );
}

export function addPortfolioItem(
  type: PortfolioItemType,
  id: string,
  expectedUid: string,
) {
  return portfolioRequest<AddPortfolioItemResponse>("/assets", expectedUid, {
    method: "POST",
    body: JSON.stringify({ id, type }),
  });
}

export function removePortfolioItem(
  type: PortfolioItemType,
  id: string,
  expectedUid: string,
) {
  return portfolioRequest<void>(
    `/assets/${type}/${encodeURIComponent(id)}`,
    expectedUid,
    { method: "DELETE" },
  );
}

export function updatePortfolioItemQuantity(
  type: PortfolioItemType,
  id: string,
  quantity: number,
  expectedUid: string,
) {
  return portfolioRequest<PortfolioReference>(
    `/assets/${type}/${encodeURIComponent(id)}/quantity`,
    expectedUid,
    {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    },
  );
}

export function addPortfolioCard(cardId: string, expectedUid: string) {
  return addPortfolioItem("single", cardId, expectedUid);
}

export function removePortfolioCard(cardId: string, expectedUid: string) {
  return removePortfolioItem("single", cardId, expectedUid);
}

export function updatePortfolioCardQuantity(
  cardId: string,
  quantity: number,
  expectedUid: string,
) {
  return updatePortfolioItemQuantity("single", cardId, quantity, expectedUid);
}
