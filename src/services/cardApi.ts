import type { PokemonCard } from "../types/pokemon";
import {
  isPokeTraceMarket,
  type PokeTraceMarket,
} from "../../shared/pokeTraceMarkets";
import {
  isMarketHistoryTier,
  type MarketHistoryTier,
} from "../../shared/pokeTraceHistoryTiers";

import type {
  PokeTraceMarketHistory,
  PokeTraceMarketHistoryPoint,
  PokeTraceMarketHistorySource,
} from "../types/pokemon";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

import type { CardPriceHistoryResponse } from "../../shared/pokeTracePriceHistory";
export type {
  CardPriceHistoryResponse,
  CardPriceHistorySnapshot,
} from "../../shared/pokeTracePriceHistory";

export type MarketPriceHistorySource = PokeTraceMarketHistorySource;
export type MarketPriceHistoryPoint = PokeTraceMarketHistoryPoint;
export type MarketPriceHistoryResponse = PokeTraceMarketHistory;

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

function nullableFiniteNumber(value: unknown) {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function parseMarketPriceHistoryResponse(
  value: unknown,
): MarketPriceHistoryResponse {
  if (
    !isRecord(value) ||
    typeof value.cardId !== "string" ||
    !isMarketHistoryTier(value.condition) ||
    value.period !== "1y" ||
    typeof value.currency !== "string" ||
    typeof value.fetchedAt !== "string" ||
    typeof value.stale !== "boolean" ||
    !isPokeTraceMarket(value.market) ||
    !isRecord(value.series)
  ) {
    throw new Error("Invalid marketplace price-history response");
  }

  const series: MarketPriceHistoryResponse["series"] = {};
  for (const source of [
    "tcgplayer",
    "ebay",
    "cardmarket",
    "cardmarket_unsold",
  ] as const) {
    const rawPoints = value.series[source];
    if (rawPoints === undefined) continue;
    if (!Array.isArray(rawPoints)) {
      throw new Error("Invalid marketplace price-history series");
    }
    series[source] = rawPoints.map((point) => {
      if (
        !isRecord(point) ||
        typeof point.date !== "string" ||
        typeof point.avg !== "number" ||
        !Number.isFinite(point.avg) ||
        !nullableFiniteNumber(point.median7d) ||
        !nullableFiniteNumber(point.median30d) ||
        !nullableFiniteNumber(point.low) ||
        !nullableFiniteNumber(point.high) ||
        !nullableFiniteNumber(point.saleCount) ||
        (point.approxSaleCount !== null &&
          typeof point.approxSaleCount !== "boolean")
      ) {
        throw new Error("Invalid marketplace price-history point");
      }
      return {
        date: point.date,
        avg: point.avg,
        median7d: point.median7d as number | null,
        median30d: point.median30d as number | null,
        low: point.low as number | null,
        high: point.high as number | null,
        saleCount: point.saleCount as number | null,
        approxSaleCount: point.approxSaleCount,
      };
    });
  }

  return {
    cardId: value.cardId,
    condition: value.condition,
    period: value.period,
    currency: value.currency,
    fetchedAt: value.fetchedAt,
    stale: value.stale,
    market: value.market,
    series,
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

export async function fetchCardById(
  cardId: string,
  signal?: AbortSignal,
): Promise<PokemonCard> {
  if (cardId === "demo") {
    const [liveCard, demoValue] = await Promise.all([
      fetchCardById("019bff9a-8592-77ae-8865-c500279b7630", signal),
      cardRequest(`${import.meta.env.BASE_URL}demo-card.json`, signal),
    ]);
    const demo = normalizeCardResponse(demoValue, "demo");
    return {
      ...liveCard,
      grok: demo.grok,
      ebay: demo.ebay,
      tcg_listings: demo.tcg_listings,
    };
  }
  const value = await cardRequest(
    `${API_URL}/api/cards/${encodeURIComponent(cardId)}`,
    signal,
  );
  return normalizeCardResponse(value, cardId);
}

function normalizeCardResponse(value: unknown, cardId: string): PokemonCard {
  if (!isRecord(value) || value.id !== cardId) {
    throw new Error("Invalid card response");
  }
  // Normalize older API/demo payloads at the boundary. Feature components only
  // receive eBay results through the independent field.
  if (isRecord(value.grok) && "ebay_sold" in value.grok) {
    const { ebay_sold: legacyEbay, ...grok } = value.grok;
    return {
      ...value,
      grok,
      ...(isRecord(value.ebay) || isRecord(legacyEbay)
        ? { ebay: isRecord(value.ebay) ? value.ebay : legacyEbay }
        : {}),
    } as PokemonCard;
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

export async function fetchMarketPriceHistory(
  cardId: string,
  signal?: AbortSignal,
  tier: MarketHistoryTier = "NEAR_MINT",
  market: PokeTraceMarket = "US",
) {
  const query = `?${new URLSearchParams({ tier, market })}`;
  const value = await cardRequest(
    `${API_URL}/api/cards/${encodeURIComponent(cardId)}/market-price-history${query}`,
    signal,
  );
  const history = parseMarketPriceHistoryResponse(value);
  if (history.cardId !== cardId) {
    throw new Error(
      "Marketplace price-history response belongs to another card",
    );
  }
  if (history.condition !== tier) {
    throw new Error(
      "Marketplace price-history response belongs to another tier",
    );
  }
  if (history.market !== market)
    throw new Error(
      "Marketplace price-history response belongs to another market",
    );
  return history;
}
