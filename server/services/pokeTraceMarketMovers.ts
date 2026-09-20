import {
  type MarketMoverItem,
  type MarketMoversQuery,
  type MarketMoversResponse,
} from "../../shared/marketMovers.js";

const POKETRACE_API_BASE_URL = "https://api.poketrace.com";
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_RETRY_MS = 60 * 1000;

type JsonRecord = Record<string, unknown>;

type MarketMoversLoaderOptions = {
  apiKey?: () => string | undefined;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export class PokeTraceMoversUnavailableError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`PokeTrace mover contains an invalid ${field}`);
  }
  return value;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`PokeTrace mover contains an invalid ${field}`);
  }
  return value.trim();
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseMover(value: unknown, market: MarketMoversQuery["market"]) {
  if (!isRecord(value) || !isRecord(value.set)) {
    throw new Error("PokeTrace mover contains invalid data");
  }

  const item: MarketMoverItem = {
    approxSaleCount:
      typeof value.approxSaleCount === "boolean"
        ? value.approxSaleCount
        : false,
    cardId: text(value.cardId, "cardId"),
    cardNumber: nullableText(value.cardNumber),
    changeAbs: finiteNumber(value.changeAbs, "changeAbs"),
    changePct: finiteNumber(value.changePct, "changePct"),
    currency: market === "EU" ? "EUR" : "USD",
    currentPrice: finiteNumber(value.currentPrice, "currentPrice"),
    game: text(value.game, "game"),
    image: nullableText(value.image),
    name: text(value.name, "name"),
    price7dAvg: finiteNumber(value.price7dAvg, "price7dAvg"),
    rarity: nullableText(value.rarity),
    saleCount: finiteNumber(value.saleCount, "saleCount"),
    set: {
      name: text(value.set.name, "set.name"),
      slug: text(value.set.slug, "set.slug"),
    },
    source: text(value.source, "source"),
    tier: text(value.tier, "tier"),
    variant: nullableText(value.variant),
  };

  if (item.currentPrice <= 0 || item.price7dAvg <= 0 || item.saleCount < 0) {
    throw new Error("PokeTrace mover contains invalid market values");
  }
  return item;
}

function cacheKey(query: MarketMoversQuery) {
  return JSON.stringify(query);
}

type CachedMarketMovers = {
  expiresAt: number;
  fetchedAt: string;
  items: MarketMoverItem[];
  stale: boolean;
};

function responseFromCache(
  cached: CachedMarketMovers,
  query: MarketMoversQuery,
): MarketMoversResponse {
  return {
    fetchedAt: cached.fetchedAt,
    items: cached.items,
    query,
    stale: cached.stale,
  };
}

export function createMarketMoversLoader(
  options: MarketMoversLoaderOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cacheEnabled = cacheTtlMs > 0;
  const readApiKey =
    options.apiKey ?? (() => process.env.POKETRACE_API_KEY?.trim());
  const cache = new Map<string, CachedMarketMovers>();
  const activeRequests = new Map<string, Promise<CachedMarketMovers>>();

  return async function loadMarketMovers(
    query: MarketMoversQuery,
  ): Promise<MarketMoversResponse> {
    const key = cacheKey(query);
    const cached = cacheEnabled ? cache.get(key) : undefined;
    if (cached && cached.expiresAt > now()) {
      return responseFromCache(cached, query);
    }

    const active = activeRequests.get(key);
    if (active) return responseFromCache(await active, query);

    const request = (async () => {
      try {
        const apiKey = readApiKey();
        if (!apiKey) {
          throw new PokeTraceMoversUnavailableError(
            "PokeTrace movers are not configured",
          );
        }
        const params = new URLSearchParams({
          direction: query.direction,
          game: query.game,
          limit: String(query.limit),
          market: query.market,
        });
        if (query.hasGraded !== undefined) {
          params.set("has_graded", String(query.hasGraded));
        }
        if (query.maxDiff !== undefined) {
          params.set("max_diff", String(query.maxDiff));
        }
        if (query.minPrice !== undefined) {
          params.set("min_price", String(query.minPrice));
        }
        if (query.source) params.set("source", query.source);
        if (query.tier) params.set("tier", query.tier);
        const response = await fetchImpl(
          `${POKETRACE_API_BASE_URL}/v1/cards/movers?${params}`,
          {
            headers: { Accept: "application/json", "X-API-Key": apiKey },
            signal: AbortSignal.timeout(12_000),
          },
        );
        if (!response.ok) {
          throw new Error(`PokeTrace movers returned HTTP ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (!isRecord(payload) || !Array.isArray(payload.data)) {
          throw new Error("PokeTrace movers returned invalid data");
        }

        const responsePayload: CachedMarketMovers = {
          expiresAt: now() + cacheTtlMs,
          fetchedAt: new Date(now()).toISOString(),
          items: payload.data.map((item) => parseMover(item, query.market)),
          stale: false,
        };
        if (cacheEnabled) cache.set(key, responsePayload);
        return responsePayload;
      } catch (error) {
        if (cached) {
          const stale = {
            ...cached,
            expiresAt: now() + Math.min(cacheTtlMs, STALE_RETRY_MS),
            stale: true,
          };
          cache.set(key, stale);
          return stale;
        }
        throw error;
      }
    })();

    activeRequests.set(key, request);
    try {
      return responseFromCache(await request, query);
    } finally {
      activeRequests.delete(key);
    }
  };
}

export const loadPokeTraceMarketMovers = createMarketMoversLoader();
