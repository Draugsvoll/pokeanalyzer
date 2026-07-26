import type {
  CardMarket,
  PokemonCard,
  TCGPlayer,
} from "../types/pokemon";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type CardPriceHistorySnapshot = {
  recordedAt: string;
  tcgplayerPrices: Partial<TCGPlayer["prices"]> | null;
  cardmarketPrices: Partial<CardMarket["prices"]> | null;
  tcgplayerUpdatedAt: string | null;
  cardmarketUpdatedAt: string | null;
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

function parsePriceObject(value: unknown, field: string) {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new Error(`Invalid ${field} in price-history response`);
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
      !isNullableString(snapshot.tcgplayerUpdatedAt) ||
      !isNullableString(snapshot.cardmarketUpdatedAt)
    ) {
      throw new Error("Invalid snapshot in price-history response");
    }

    return {
      recordedAt: snapshot.recordedAt,
      tcgplayerPrices: parsePriceObject(
        snapshot.tcgplayerPrices,
        "tcgplayerPrices",
      ) as Partial<TCGPlayer["prices"]> | null,
      cardmarketPrices: parsePriceObject(
        snapshot.cardmarketPrices,
        "cardmarketPrices",
      ) as Partial<CardMarket["prices"]> | null,
      tcgplayerUpdatedAt: snapshot.tcgplayerUpdatedAt,
      cardmarketUpdatedAt: snapshot.cardmarketUpdatedAt,
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

async function cardRequest(path: string, signal?: AbortSignal) {
  const response = await fetch(`${API_URL}${path}`, { signal });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json() as Promise<unknown>;
}

export async function fetchCardById(cardId: string, signal?: AbortSignal) {
  const value = await cardRequest(
    `/api/cards/${encodeURIComponent(cardId)}`,
    signal,
  );
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
    `/api/cards/${encodeURIComponent(cardId)}/price-history?${params}`,
    signal,
  );
  const history = parsePriceHistoryResponse(value);
  if (history.cardId !== cardId) {
    throw new Error("Price-history response belongs to another card");
  }
  return history;
}
