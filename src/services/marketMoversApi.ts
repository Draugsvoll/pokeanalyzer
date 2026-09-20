import type {
  MarketMoverItem,
  MarketMoversQuery,
  MarketMoversResponse,
} from "../../shared/marketMovers";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseMover(value: unknown): MarketMoverItem {
  if (
    !isRecord(value) ||
    !isRecord(value.set) ||
    typeof value.approxSaleCount !== "boolean" ||
    typeof value.cardId !== "string" ||
    !isNullableString(value.cardNumber) ||
    !isFiniteNumber(value.changeAbs) ||
    !isFiniteNumber(value.changePct) ||
    (value.currency !== "USD" && value.currency !== "EUR") ||
    !isFiniteNumber(value.currentPrice) ||
    typeof value.game !== "string" ||
    !isNullableString(value.image) ||
    typeof value.name !== "string" ||
    !isFiniteNumber(value.price7dAvg) ||
    !isNullableString(value.rarity) ||
    !isFiniteNumber(value.saleCount) ||
    typeof value.set.name !== "string" ||
    typeof value.set.slug !== "string" ||
    typeof value.source !== "string" ||
    typeof value.tier !== "string" ||
    !isNullableString(value.variant)
  ) {
    throw new Error("Invalid market mover response item");
  }

  return value as MarketMoverItem;
}

function parseResponse(value: unknown): MarketMoversResponse {
  if (
    !isRecord(value) ||
    typeof value.fetchedAt !== "string" ||
    !Array.isArray(value.items) ||
    !isRecord(value.query) ||
    typeof value.stale !== "boolean"
  ) {
    throw new Error("Invalid market movers response");
  }
  return {
    fetchedAt: value.fetchedAt,
    items: value.items.map(parseMover),
    query: value.query as MarketMoversQuery,
    stale: value.stale,
  };
}

async function readError(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  if (isRecord(value) && typeof value.error === "string") return value.error;
  return `Market movers request failed: ${response.status}`;
}

export async function fetchMarketMovers(
  query: MarketMoversQuery,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    direction: query.direction,
    game: query.game,
    limit: String(query.limit),
    market: query.market,
  });
  if (query.hasGraded !== undefined) {
    params.set("hasGraded", String(query.hasGraded));
  }
  if (query.maxDiff !== undefined) {
    params.set("maxDiff", String(query.maxDiff));
  }
  if (query.minPrice !== undefined) {
    params.set("minPrice", String(query.minPrice));
  }
  if (query.source) params.set("source", query.source);
  if (query.tier) params.set("tier", query.tier);

  const response = await fetch(`${API_URL}/api/cards/movers?${params}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return parseResponse(await response.json());
}

export type MarketMoversFetcher = (
  signal?: AbortSignal,
) => Promise<MarketMoversResponse>;

const TCGPLAYER_NEAR_MINT_WEEKLY_QUERY = {
  game: "pokemon",
  limit: 10,
  market: "US",
  minPrice: 20,
  source: "tcgplayer",
  tier: "NEAR_MINT",
} as const;

export function weeklyGainersTcgNearMint(signal?: AbortSignal) {
  return fetchMarketMovers(
    { ...TCGPLAYER_NEAR_MINT_WEEKLY_QUERY, direction: "gainers" },
    signal,
  );
}

export function weeklyLosersTcgNearMint(signal?: AbortSignal) {
  return fetchMarketMovers(
    { ...TCGPLAYER_NEAR_MINT_WEEKLY_QUERY, direction: "losers" },
    signal,
  );
}
