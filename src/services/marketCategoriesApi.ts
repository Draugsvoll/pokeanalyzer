import type {
  MarketMoverItem,
  MarketMoversResponse,
} from "../../shared/marketMovers";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const MARKET_CATEGORIES_URL = `${API_URL}/api/market-categories`;
const MARKET_CATEGORIES_CACHE_KEY = "pokelyzer:market-categories:v1";
const MARKET_CATEGORIES_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

type JsonRecord = Record<string, unknown>;

type MarketCategoriesPayload = {
  categories: JsonRecord[];
  generatedAt: string;
  schemaVersion: 1;
};

type CachedMarketCategories = {
  cachedAt: number;
  payload: MarketCategoriesPayload;
};

export type MostSoldItem = {
  cardId: string;
  cardNumber: string | null;
  currency: string;
  currentPrice: number;
  image: string | null;
  name: string;
  newSales: number;
  prices: Record<string, unknown>;
  rarity: string | null;
  setName: string | null;
  variant: string | null;
};

export type MostSoldResponse = {
  comparisonSnapshotDate: string | null;
  condition:
    | "ALL"
    | "NEAR_MINT"
    | "LIGHTLY_PLAYED"
    | "MODERATELY_PLAYED"
    | "HEAVILY_PLAYED"
    | "DAMAGED";
  currentSnapshotDate: string | null;
  fetchedAt: string;
  items: MostSoldItem[];
  periodDays: number;
  source: "ebay" | "tcgplayer";
};

let memoryCache: CachedMarketCategories | null = null;
let pendingServerPayload: Promise<MarketCategoriesPayload> | null = null;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parsePayload(value: unknown): MarketCategoriesPayload {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !Array.isArray(value.categories) ||
    !value.categories.every(isRecord)
  ) {
    throw new Error("Invalid market categories response");
  }
  return value as MarketCategoriesPayload;
}

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid market category ${field}`);
  }
  return value;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid market category ${field}`);
  }
  return value.trim();
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function setSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseItem(value: unknown): MarketMoverItem {
  if (!isRecord(value)) {
    throw new Error("Invalid market category item");
  }
  const currency = nullableText(value.currency) ?? "USD";
  if (currency !== "USD" && currency !== "EUR") {
    throw new Error("Invalid market category currency");
  }
  const setName = nullableText(value.setName) ?? "Unknown set";
  const saleCount =
    value.saleCount === null ? 0 : finiteNumber(value.saleCount, "saleCount");

  return {
    approxSaleCount: false,
    cardId: text(value.cardId, "cardId"),
    cardNumber: nullableText(value.cardNumber),
    changeAbs: finiteNumber(value.change, "change"),
    changePct: finiteNumber(value.changePercent, "changePercent"),
    currency,
    currentPrice: finiteNumber(value.currentPrice, "currentPrice"),
    game: "pokemon",
    image: nullableText(value.image),
    name: text(value.name, "name"),
    price7dAvg: finiteNumber(value.previousPrice, "previousPrice"),
    rarity: nullableText(value.rarity),
    saleCount,
    set: { name: setName, slug: setSlug(setName) },
    source: text(value.source, "source"),
    tier: text(value.condition, "condition"),
    variant: nullableText(value.variant),
  };
}

function findCategory(payload: MarketCategoriesPayload, categoryId: string) {
  const category = payload.categories.find(
    (candidate) => candidate.id === categoryId,
  );
  if (!category) {
    throw new Error(`Market category not found: ${categoryId}`);
  }
  return category;
}

function parseCategory(
  payload: MarketCategoriesPayload,
  categoryId: string,
): MarketMoversResponse {
  const category = findCategory(payload, categoryId);
  if (!Array.isArray(category.items) || !isRecord(category.parameters)) {
    throw new Error(`Invalid market category: ${categoryId}`);
  }
  const direction = category.parameters.direction;
  if (direction !== "gainers" && direction !== "losers") {
    throw new Error("Invalid market category direction");
  }

  return {
    fetchedAt: payload.generatedAt,
    items: category.items.map(parseItem),
    query: {
      direction,
      game: "pokemon",
      limit: category.items.length,
      market: "US",
    },
    stale: false,
  };
}

function parseMostSoldCategory(
  payload: MarketCategoriesPayload,
  categoryId: string,
): MostSoldResponse {
  const category = findCategory(payload, categoryId);
  if (
    !Array.isArray(category.items) ||
    !isRecord(category.parameters) ||
    (category.currentSnapshotDate !== null &&
      typeof category.currentSnapshotDate !== "string") ||
    (category.comparisonSnapshotDate !== null &&
      typeof category.comparisonSnapshotDate !== "string")
  ) {
    throw new Error(`Invalid market category: ${categoryId}`);
  }
  const source = category.parameters.source;
  if (source !== "tcgplayer" && source !== "ebay") {
    throw new Error("Invalid most-sold market source");
  }
  const condition = category.parameters.condition;
  if (
    condition !== "ALL" &&
    condition !== "NEAR_MINT" &&
    condition !== "LIGHTLY_PLAYED" &&
    condition !== "MODERATELY_PLAYED" &&
    condition !== "HEAVILY_PLAYED" &&
    condition !== "DAMAGED"
  ) {
    throw new Error("Invalid most-sold market condition");
  }
  const periodDays = finiteNumber(category.parameters.periodDays, "periodDays");

  return {
    comparisonSnapshotDate: category.comparisonSnapshotDate,
    condition,
    currentSnapshotDate: category.currentSnapshotDate,
    fetchedAt: payload.generatedAt,
    items: category.items.map((item) => {
      if (!isRecord(item) || !isRecord(item.prices)) {
        throw new Error("Invalid most-sold category item");
      }
      return {
        cardId: text(item.cardId, "cardId"),
        cardNumber: nullableText(item.cardNumber),
        currency: nullableText(item.currency) ?? "USD",
        currentPrice: finiteNumber(item.currentPrice, "currentPrice"),
        image: nullableText(item.image),
        name: text(item.name, "name"),
        newSales: finiteNumber(item.newSales, "newSales"),
        prices: item.prices,
        rarity: nullableText(item.rarity),
        setName: nullableText(item.setName),
        variant: nullableText(item.variant),
      };
    }),
    periodDays,
    source,
  };
}

function isFresh(cache: CachedMarketCategories) {
  const age = Date.now() - cache.cachedAt;
  return age >= 0 && age < MARKET_CATEGORIES_CACHE_TTL_MS;
}

function readFreshBrowserCache(): MarketCategoriesPayload | null {
  if (memoryCache && isFresh(memoryCache)) return memoryCache.payload;

  try {
    const stored = localStorage.getItem(MARKET_CATEGORIES_CACHE_KEY);
    if (!stored) return null;
    const value: unknown = JSON.parse(stored);
    if (
      !isRecord(value) ||
      typeof value.cachedAt !== "number" ||
      !Number.isFinite(value.cachedAt)
    ) {
      throw new Error("Invalid market categories cache");
    }
    const cache = {
      cachedAt: value.cachedAt,
      payload: parsePayload(value.payload),
    };
    if (!isFresh(cache)) {
      clearMarketCategoriesCache();
      return null;
    }
    memoryCache = cache;
    return cache.payload;
  } catch {
    clearMarketCategoriesCache();
    return null;
  }
}

function cachePayload(payload: MarketCategoriesPayload) {
  const cache = { cachedAt: Date.now(), payload };
  memoryCache = cache;
  try {
    localStorage.setItem(MARKET_CATEGORIES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // The in-memory cache still prevents duplicate requests for this page load.
  }
}

export function clearMarketCategoriesCache() {
  memoryCache = null;
  pendingServerPayload = null;
  try {
    localStorage.removeItem(MARKET_CATEGORIES_CACHE_KEY);
  } catch {
    // A blocked browser cache should not prevent a server request.
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Request aborted", "AbortError");
  }
}

async function fetchServerPayload(signal?: AbortSignal) {
  throwIfAborted(signal);
  pendingServerPayload ??= fetch(MARKET_CATEGORIES_URL, {
    cache: "no-store",
  })
    .then(async (response) => {
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          isRecord(value) && typeof value.error === "string"
            ? value.error
            : `Market categories request failed: ${response.status}`;
        throw new Error(message);
      }
      const payload = parsePayload(value);
      cachePayload(payload);
      return payload;
    })
    .finally(() => {
      pendingServerPayload = null;
    });

  const payload = await pendingServerPayload;
  throwIfAborted(signal);
  return payload;
}

async function loadCategory<Result>(
  parse: (payload: MarketCategoriesPayload) => Result,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  const cached = readFreshBrowserCache();
  if (cached) {
    try {
      return parse(cached);
    } catch {
      clearMarketCategoriesCache();
    }
  }
  return parse(await fetchServerPayload(signal));
}

export function fetchMarketCategory(categoryId: string, signal?: AbortSignal) {
  return loadCategory((payload) => parseCategory(payload, categoryId), signal);
}

export function dailyTcgNearMintGainers(signal?: AbortSignal) {
  return fetchMarketCategory("daily-tcg-near-mint-gainers", signal);
}

export function dailyTcgNearMintLosers(signal?: AbortSignal) {
  return fetchMarketCategory("daily-tcg-near-mint-losers", signal);
}

export function mostSoldCards(signal?: AbortSignal) {
  return loadCategory(
    (payload) => parseMostSoldCategory(payload, "most-sold"),
    signal,
  );
}

export function mostSoldEbayCards(signal?: AbortSignal) {
  return loadCategory(
    (payload) => parseMostSoldCategory(payload, "most-sold-ebay"),
    signal,
  );
}
