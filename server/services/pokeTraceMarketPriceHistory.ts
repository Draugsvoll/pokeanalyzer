import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import {
  fetchPokeTracePriceHistory,
  type PokeTracePriceHistoryPoint,
} from "./pokeTraceApi.js";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MARKET_SOURCES = ["tcgplayer", "ebay"] as const;

export type MarketPriceHistorySource = (typeof MARKET_SOURCES)[number];
export type MarketPriceHistoryPoint = Omit<
  PokeTracePriceHistoryPoint,
  "source" | "avg"
> & { avg: number };

export type MarketPriceHistory = {
  cardId: string;
  condition: "NEAR_MINT";
  period: "90d";
  currency: string;
  fetchedAt: string;
  stale: boolean;
  series: Partial<Record<MarketPriceHistorySource, MarketPriceHistoryPoint[]>>;
};

type StoredMarketPriceHistory = Omit<MarketPriceHistory, "cardId" | "stale">;
type HistoryDatabase = Pick<typeof pokeTraceDb, "execute">;

type HistoryDependencies = {
  database?: HistoryDatabase;
  ready?: Promise<unknown>;
  apiKey?: string;
  now?: () => number;
  fetchHistory?: typeof fetchPokeTracePriceHistory;
};

export class PokeTracePriceHistoryUnavailableError extends Error {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSource(value: string): value is MarketPriceHistorySource {
  return MARKET_SOURCES.includes(value as MarketPriceHistorySource);
}

function parsePoint(value: unknown): MarketPriceHistoryPoint | null {
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

function parseStoredHistory(value: unknown): StoredMarketPriceHistory | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const history = parsed as Record<string, unknown>;
    if (
      history.condition !== "NEAR_MINT" ||
      history.period !== "90d" ||
      typeof history.currency !== "string" ||
      typeof history.fetchedAt !== "string" ||
      !history.series ||
      typeof history.series !== "object" ||
      Array.isArray(history.series)
    ) {
      return null;
    }

    const series: StoredMarketPriceHistory["series"] = {};
    for (const source of MARKET_SOURCES) {
      const rawPoints = (history.series as Record<string, unknown>)[source];
      if (rawPoints === undefined) continue;
      if (!Array.isArray(rawPoints)) return null;
      const points = rawPoints.map(parsePoint);
      if (points.some((point) => point === null)) return null;
      series[source] = points as MarketPriceHistoryPoint[];
    }

    return {
      condition: "NEAR_MINT",
      period: "90d",
      currency: history.currency,
      fetchedAt: history.fetchedAt,
      series,
    };
  } catch {
    return null;
  }
}

function currencyFromRawCard(value: unknown) {
  if (typeof value !== "string") return "USD";
  try {
    const card = JSON.parse(value) as { currency?: unknown };
    return typeof card.currency === "string" && card.currency
      ? card.currency
      : "USD";
  } catch {
    return "USD";
  }
}

function groupSeries(points: PokeTracePriceHistoryPoint[]) {
  const series: MarketPriceHistory["series"] = {};
  for (const point of points) {
    const source = point.source.toLowerCase();
    if (!isSource(source) || !isFiniteNumber(point.avg)) continue;
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
  for (const pointsForSource of Object.values(series)) {
    pointsForSource.sort((left, right) => left.date.localeCompare(right.date));
  }
  return series;
}

const activeHistoryFetches = new Map<
  string,
  Promise<MarketPriceHistory | null>
>();

export async function loadMarketPriceHistory(
  cardId: string,
  dependencies: HistoryDependencies = {},
): Promise<MarketPriceHistory | null> {
  const database = dependencies.database ?? pokeTraceDb;
  await (dependencies.ready ?? ensurePokeTraceReady());
  const now = dependencies.now ?? Date.now;
  const result = await database.execute({
    sql: `
      SELECT raw_json, market_price_history, market_price_history_fetched_at
      FROM poketrace_cards
      WHERE id = ?
    `,
    args: [cardId],
  });
  const row = result.rows[0];
  if (!row) return null;

  const cached = parseStoredHistory(row.market_price_history);
  const fetchedAt =
    typeof row.market_price_history_fetched_at === "string"
      ? Date.parse(row.market_price_history_fetched_at)
      : Number.NaN;
  if (
    cached &&
    Number.isFinite(fetchedAt) &&
    now() - fetchedAt < CACHE_TTL_MS
  ) {
    return { cardId, ...cached, stale: false };
  }

  const existing = activeHistoryFetches.get(cardId);
  if (existing && !dependencies.fetchHistory && !dependencies.database) {
    return existing;
  }

  const refresh = (async () => {
    const apiKey = dependencies.apiKey ?? process.env.POKETRACE_API_KEY?.trim();
    if (!apiKey) {
      if (cached) return { cardId, ...cached, stale: true };
      throw new PokeTracePriceHistoryUnavailableError(
        "PokeTrace price history is not configured",
      );
    }

    try {
      const response = await (
        dependencies.fetchHistory ?? fetchPokeTracePriceHistory
      )(apiKey, cardId);
      const refreshedAt = new Date(now()).toISOString();
      const history: StoredMarketPriceHistory = {
        condition: "NEAR_MINT",
        period: "90d",
        currency: currencyFromRawCard(row.raw_json),
        fetchedAt: refreshedAt,
        series: groupSeries(response.data),
      };
      await database.execute({
        sql: `
          UPDATE poketrace_cards
          SET market_price_history = ?, market_price_history_fetched_at = ?
          WHERE id = ?
        `,
        args: [JSON.stringify(history), refreshedAt, cardId],
      });
      return { cardId, ...history, stale: false };
    } catch (error) {
      if (cached) return { cardId, ...cached, stale: true };
      throw error;
    }
  })();

  if (!dependencies.fetchHistory && !dependencies.database) {
    activeHistoryFetches.set(cardId, refresh);
  }
  try {
    return await refresh;
  } finally {
    if (activeHistoryFetches.get(cardId) === refresh) {
      activeHistoryFetches.delete(cardId);
    }
  }
}
