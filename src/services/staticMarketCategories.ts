import type {
  MarketMoverItem,
  MarketMoversResponse,
} from "../../shared/marketMovers";

const STATIC_CATEGORIES_URL = "/market-categories.json";

type JsonRecord = Record<string, unknown>;

export type StaticMostSoldItem = {
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

export type StaticMostSoldResponse = {
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
  items: StaticMostSoldItem[];
  periodDays: number;
  source: "ebay" | "tcgplayer";
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid static market category ${field}`);
  }
  return value;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid static market category ${field}`);
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
    throw new Error("Invalid static market category item");
  }
  const currency = nullableText(value.currency) ?? "USD";
  if (currency !== "USD" && currency !== "EUR") {
    throw new Error("Invalid static market category currency");
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

function parseCategoryFile(
  value: unknown,
  categoryId: string,
): MarketMoversResponse {
  if (
    !isRecord(value) ||
    typeof value.generatedAt !== "string" ||
    !Array.isArray(value.categories)
  ) {
    throw new Error("Invalid static market categories response");
  }
  const category = value.categories.find(
    (candidate) => isRecord(candidate) && candidate.id === categoryId,
  );
  if (
    !isRecord(category) ||
    !Array.isArray(category.items) ||
    !isRecord(category.parameters)
  ) {
    throw new Error(`Static market category not found: ${categoryId}`);
  }
  const direction = category.parameters.direction;
  if (direction !== "gainers" && direction !== "losers") {
    throw new Error("Invalid static market category direction");
  }

  return {
    fetchedAt: value.generatedAt,
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

function parseMostSoldFile(
  value: unknown,
  categoryId: string,
): StaticMostSoldResponse {
  if (
    !isRecord(value) ||
    typeof value.generatedAt !== "string" ||
    !Array.isArray(value.categories)
  ) {
    throw new Error("Invalid static market categories response");
  }
  const category = value.categories.find(
    (candidate) => isRecord(candidate) && candidate.id === categoryId,
  );
  if (
    !isRecord(category) ||
    !Array.isArray(category.items) ||
    !isRecord(category.parameters) ||
    (category.currentSnapshotDate !== null &&
      typeof category.currentSnapshotDate !== "string") ||
    (category.comparisonSnapshotDate !== null &&
      typeof category.comparisonSnapshotDate !== "string")
  ) {
    throw new Error(`Static market category not found: ${categoryId}`);
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
    fetchedAt: value.generatedAt,
    items: category.items.map((item) => {
      if (!isRecord(item)) {
        throw new Error("Invalid most-sold category item");
      }
      if (!isRecord(item.prices)) {
        throw new Error("Invalid most-sold category prices");
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

async function fetchCategoryFile(signal?: AbortSignal) {
  const response = await fetch(STATIC_CATEGORIES_URL, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Static market categories request failed: ${response.status}`,
    );
  }
  return response.json() as Promise<unknown>;
}

export async function fetchStaticMarketCategory(
  categoryId: string,
  signal?: AbortSignal,
) {
  return parseCategoryFile(await fetchCategoryFile(signal), categoryId);
}

export function dailyTcgNearMintGainers(signal?: AbortSignal) {
  return fetchStaticMarketCategory("daily-tcg-near-mint-gainers", signal);
}

export function dailyTcgNearMintLosers(signal?: AbortSignal) {
  return fetchStaticMarketCategory("daily-tcg-near-mint-losers", signal);
}

export async function mostSoldCards(signal?: AbortSignal) {
  return parseMostSoldFile(await fetchCategoryFile(signal), "most-sold");
}

export async function mostSoldEbayCards(signal?: AbortSignal) {
  return parseMostSoldFile(await fetchCategoryFile(signal), "most-sold-ebay");
}
