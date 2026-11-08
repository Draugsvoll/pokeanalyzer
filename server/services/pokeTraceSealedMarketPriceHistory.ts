import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import {
  fetchPokeTraceSealedPriceHistory,
  type PokeTracePriceHistoryPoint,
} from "./pokeTraceApi.js";
import type { PokeTraceMarket } from "../../shared/pokeTraceMarkets.js";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MARKET_SOURCES = [
  "tcgplayer",
  "ebay",
  "cardmarket",
  "cardmarket_unsold",
] as const;

type MarketSource = (typeof MARKET_SOURCES)[number];
type HistoryPoint = Omit<PokeTracePriceHistoryPoint, "avg" | "source"> & {
  avg: number;
};

export type PokeTraceSealedMarketPriceHistory = {
  productId: string;
  condition: "UNOPENED";
  period: "1y";
  currency: string;
  market: PokeTraceMarket;
  fetchedAt: string;
  stale: boolean;
  series: Partial<Record<MarketSource, HistoryPoint[]>>;
};

type StoredSealedMarketPriceHistory = Omit<
  PokeTraceSealedMarketPriceHistory,
  "productId" | "stale"
>;
type HistoryDatabase = Pick<typeof pokeTraceDb, "execute">;

type HistoryDependencies = {
  market?: PokeTraceMarket;
  database?: HistoryDatabase;
  ready?: Promise<unknown>;
  apiKey?: string;
  now?: () => number;
  fetchHistory?: typeof fetchPokeTraceSealedPriceHistory;
};

export class PokeTraceSealedPriceHistoryUnavailableError extends Error {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMarketSource(value: string): value is MarketSource {
  return MARKET_SOURCES.includes(value as MarketSource);
}

function parsePoint(value: unknown): HistoryPoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const point = value as Record<string, unknown>;
  if (
    typeof point.date !== "string" ||
    !isFiniteNumber(point.avg) ||
    (point.median7d !== undefined &&
      point.median7d !== null &&
      !isFiniteNumber(point.median7d)) ||
    (point.median30d !== undefined &&
      point.median30d !== null &&
      !isFiniteNumber(point.median30d)) ||
    (point.low !== null && !isFiniteNumber(point.low)) ||
    (point.high !== null && !isFiniteNumber(point.high)) ||
    (point.saleCount !== null && !isFiniteNumber(point.saleCount)) ||
    (point.approxSaleCount !== null &&
      typeof point.approxSaleCount !== "boolean")
  ) {
    return null;
  }
  return {
    date: point.date,
    avg: point.avg,
    median7d: point.median7d ?? null,
    median30d: point.median30d ?? null,
    low: point.low ?? null,
    high: point.high ?? null,
    saleCount: point.saleCount ?? null,
    approxSaleCount: point.approxSaleCount ?? null,
  };
}

function parseStoredHistory(
  value: unknown,
  market: PokeTraceMarket,
): StoredSealedMarketPriceHistory | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const history = (parsed as Record<string, Record<string, unknown>>)[market];
    if (!history || history.market !== market) return null;
    if (
      history.condition !== "UNOPENED" ||
      history.period !== "1y" ||
      typeof history.currency !== "string" ||
      typeof history.fetchedAt !== "string" ||
      !history.series ||
      typeof history.series !== "object" ||
      Array.isArray(history.series)
    ) {
      return null;
    }

    const series: StoredSealedMarketPriceHistory["series"] = {};
    for (const source of MARKET_SOURCES) {
      const rawPoints = (history.series as Record<string, unknown>)[source];
      if (rawPoints === undefined) continue;
      if (!Array.isArray(rawPoints)) return null;
      const points = rawPoints.map(parsePoint);
      if (points.some((point) => point === null)) return null;
      series[source] = points as HistoryPoint[];
    }

    return {
      condition: "UNOPENED",
      period: history.period,
      currency: history.currency,
      market,
      fetchedAt: history.fetchedAt,
      series,
    };
  } catch {
    return null;
  }
}

function groupSeries(
  points: PokeTracePriceHistoryPoint[],
  market: PokeTraceMarket,
) {
  const series: PokeTraceSealedMarketPriceHistory["series"] = {};
  for (const point of points) {
    const source = point.source.toLowerCase();
    if (
      market === "US"
        ? source !== "ebay" && source !== "tcgplayer"
        : source !== "cardmarket" && source !== "cardmarket_unsold"
    )
      continue;
    if (!isMarketSource(source) || !isFiniteNumber(point.avg)) continue;
    (series[source] ??= []).push({
      date: point.date,
      avg: point.avg,
      median7d: point.median7d,
      median30d: point.median30d,
      low: point.low,
      high: point.high,
      saleCount: point.saleCount,
      approxSaleCount: point.approxSaleCount,
    });
  }
  for (const sourcePoints of Object.values(series)) {
    sourcePoints.sort((left, right) => left.date.localeCompare(right.date));
  }
  return series;
}

const activeHistoryFetches = new WeakMap<
  HistoryDatabase,
  Map<string, Promise<PokeTraceSealedMarketPriceHistory>>
>();

function getActiveHistoryFetches(database: HistoryDatabase) {
  let active = activeHistoryFetches.get(database);
  if (!active) {
    active = new Map();
    activeHistoryFetches.set(database, active);
  }
  return active;
}

export async function loadPokeTraceSealedMarketPriceHistory(
  productId: string,
  dependencies: HistoryDependencies = {},
): Promise<PokeTraceSealedMarketPriceHistory | null> {
  const database = dependencies.database ?? pokeTraceDb;
  const market = dependencies.market ?? "US";
  await (dependencies.ready ?? ensurePokeTraceReady());
  const now = dependencies.now ?? Date.now;
  const result = await database.execute({
    sql: `
      SELECT raw_json, market_price_history, market_price_history_fetched_at
      FROM poketrace_sealed_products
      WHERE id = ?
    `,
    args: [productId],
  });
  const row = result.rows[0];
  if (!row) return null;

  const product = JSON.parse(String(row.raw_json));
  if (
    product.markets?.[market]?.available !== true ||
    typeof product.markets[market].currency !== "string"
  ) {
    throw new PokeTraceSealedPriceHistoryUnavailableError(
      "This market is not available for this product",
    );
  }
  const cached = parseStoredHistory(row.market_price_history, market);
  const fetchedAt = cached ? Date.parse(cached.fetchedAt) : Number.NaN;
  if (
    cached &&
    cached.period === "1y" &&
    Number.isFinite(fetchedAt) &&
    now() - fetchedAt < CACHE_TTL_MS
  ) {
    return { productId, ...cached, stale: false };
  }

  const activeFetches = getActiveHistoryFetches(database);
  const cacheKey = `${productId}:${market}`;
  const existing = activeFetches.get(cacheKey);
  if (existing) return existing;

  const refresh = (async () => {
    const apiKey = dependencies.apiKey ?? process.env.POKETRACE_API_KEY?.trim();
    if (!apiKey) {
      if (cached) return { productId, ...cached, stale: true };
      throw new PokeTraceSealedPriceHistoryUnavailableError(
        "PokeTrace sealed price history is not configured",
      );
    }

    try {
      const response = await (
        dependencies.fetchHistory ?? fetchPokeTraceSealedPriceHistory
      )(apiKey, productId, { market });
      const refreshedAt = new Date(now()).toISOString();
      const history: StoredSealedMarketPriceHistory = {
        condition: "UNOPENED",
        period: "1y",
        currency: product.markets[market].currency,
        market,
        fetchedAt: refreshedAt,
        series: groupSeries(response.data, market),
      };
      await database.execute({
        sql: `
          UPDATE poketrace_sealed_products
          SET market_price_history = json_set(COALESCE(market_price_history, '{}'), ?, json(?)), market_price_history_fetched_at = ?
          WHERE id = ?
        `,
        args: [`$.${market}`, JSON.stringify(history), refreshedAt, productId],
      });
      return { productId, ...history, stale: false };
    } catch (error) {
      if (cached) return { productId, ...cached, stale: true };
      throw error;
    }
  })();

  activeFetches.set(cacheKey, refresh);
  try {
    return await refresh;
  } finally {
    if (activeFetches.get(cacheKey) === refresh) {
      activeFetches.delete(cacheKey);
    }
  }
}
