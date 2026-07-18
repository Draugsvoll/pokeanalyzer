import type { PokemonCard } from "../types/pokemon";
import { authenticatedFetch } from "../utils/authenticatedFetch";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function portfolioRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}/api/portfolio${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message || `Portfolio request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function addPortfolioCard(cardId: string) {
  return portfolioRequest<{ card: PokemonCard }>("/cards", {
    method: "POST",
    body: JSON.stringify({ cardId }),
  });
}

export function removePortfolioCard(cardId: string) {
  return portfolioRequest<void>(`/cards/${encodeURIComponent(cardId)}`, {
    method: "DELETE",
  });
}

export function updatePortfolioCardQuantity(cardId: string, quantity: number) {
  return portfolioRequest<{ cardId: string; quantity: number }>(
    `/cards/${encodeURIComponent(cardId)}/quantity`,
    {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    },
  );
}
