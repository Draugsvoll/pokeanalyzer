import type { PokemonCard } from "../types/pokemon";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type JustTcgMovementPeriod = "24h" | "7d" | "30d";

export type JustTcgMover = {
  absoluteChange?: number;
  cardName: string;
  changePercent?: number;
  condition: string;
  currentPrice: number;
  period: JustTcgMovementPeriod;
  printing: string;
  setName?: string;
};

export type JustTcgMovementResult = {
  card: PokemonCard;
  mover: JustTcgMover;
};

export async function fetchJustTcgBiggestGainers(
  signal?: AbortSignal,
  period: JustTcgMovementPeriod = "7d",
) {
  const params = new URLSearchParams({ period });
  const response = await fetch(
    `${API_URL}/api/justtcg/biggest-gainers?${params}`,
    { signal },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message ?? "Failed to fetch JustTCG gainers");
  }

  const payload = (await response.json()) as { cards?: JustTcgMovementResult[] };
  return Array.isArray(payload.cards) ? payload.cards : [];
}

export async function fetchJustTcgBiggestLosers(
  signal?: AbortSignal,
  period: JustTcgMovementPeriod = "7d",
) {
  const params = new URLSearchParams({ period });
  const response = await fetch(
    `${API_URL}/api/justtcg/biggest-losers?${params}`,
    { signal },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message ?? "Failed to fetch JustTCG losers");
  }

  const payload = (await response.json()) as { cards?: JustTcgMovementResult[] };
  return Array.isArray(payload.cards) ? payload.cards : [];
}
