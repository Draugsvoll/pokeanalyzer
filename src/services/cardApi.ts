import type { PokemonCard } from "../types/pokemon";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type CardPriceHistorySnapshot = {
  recordedAt: string;
  currency: string | null;
  prices: Record<string, unknown>;
  sourceUpdatedAt: string | null;
};

export type CardPriceHistoryResponse = {
  cardId: string;
  days: number;
  /** Daily snapshots ordered oldest to newest. Missing dates are not synthesized. */
  snapshots: CardPriceHistorySnapshot[];
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parsePriceObject(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid prices in price-history response");
  }
  return value;
}

function parsePriceHistoryResponse(value: unknown): CardPriceHistoryResponse {
  if (
    !isRecord(value) ||
    typeof value.cardId !== "string" ||
    typeof value.days !== "number" ||
    !Number.isSafeInteger(value.days) ||
    !Array.isArray(value.snapshots)
  ) {
    throw new Error("Invalid price-history response");
  }

  const snapshots = value.snapshots.map((snapshot) => {
    if (
      !isRecord(snapshot) ||
      typeof snapshot.recordedAt !== "string" ||
      !isNullableString(snapshot.currency) ||
      !isNullableString(snapshot.sourceUpdatedAt)
    ) {
      throw new Error("Invalid snapshot in price-history response");
    }

    return {
      recordedAt: snapshot.recordedAt,
      currency: snapshot.currency,
      prices: parsePriceObject(snapshot.prices),
      sourceUpdatedAt: snapshot.sourceUpdatedAt,
    };
  });

  return {
    cardId: value.cardId,
    days: value.days,
    snapshots,
  };
}

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as unknown;
  if (isRecord(body)) {
    const message = body.error ?? body.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Card request failed: ${response.status}`;
}

async function cardRequest(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json() as Promise<unknown>;
}

export async function fetchCardById(cardId: string, signal?: AbortSignal) {
  const url =
    cardId === "demo"
      ? `${import.meta.env.BASE_URL}demo-card.json`
      : `${API_URL}/api/cards/${encodeURIComponent(cardId)}`;
  const value = await cardRequest(url, signal);
  if (!isRecord(value) || value.id !== cardId) {
    throw new Error("Invalid card response");
  }
  return value as PokemonCard;
}

export async function fetchCardPriceHistory(
  cardId: string,
  days = 7,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ days: String(days) });
  const value = await cardRequest(
    `${API_URL}/api/cards/${encodeURIComponent(cardId)}/price-history?${params}`,
    signal,
  );
  const history = parsePriceHistoryResponse(value);
  if (history.cardId !== cardId) {
    throw new Error("Price-history response belongs to another card");
  }
  return history;
}
