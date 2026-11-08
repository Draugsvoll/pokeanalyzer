import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import {
  fetchPokeTraceTierPriceHistory,
  fetchPokeTracePriceHistory,
  type PokeTracePriceHistoryPoint,
} from "./pokeTraceApi.js";
import {
  isGradedHistoryTier,
  isMarketHistoryTier,
  qualifyingGradedHistoryTiers,
  type MarketHistoryTier,
} from "../../shared/pokeTraceHistoryTiers.js";
import {
  isPokeTraceMarket,
  type PokeTraceMarket,
} from "../../shared/pokeTraceMarkets.js";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MARKET_SOURCES = [
  "tcgplayer",
  "ebay",
  "cardmarket",
  "cardmarket_unsold",
] as const;

export type MarketPriceHistorySource = (typeof MARKET_SOURCES)[number];
export type MarketPriceHistoryPoint = Omit<
  PokeTracePriceHistoryPoint,
  "source" | "avg"
> & { avg: number };

export type MarketPriceHistory = {
  cardId: string;
  condition: MarketHistoryTier;
  period: "1y";
  currency: string;
  fetchedAt: string;
  stale: boolean;
  market: PokeTraceMarket;
  series: Partial<Record<MarketPriceHistorySource, MarketPriceHistoryPoint[]>>;
};

type StoredMarketPriceHistory = Omit<MarketPriceHistory, "cardId" | "stale">;
type HistoryDatabase = Pick<typeof pokeTraceDb, "execute">;

type HistoryDependencies = {
  tier?: MarketHistoryTier;
  market?: PokeTraceMarket;
  database?: HistoryDatabase;
  ready?: Promise<unknown>;
  apiKey?: string;
  now?: () => number;
  fetchHistory?: typeof fetchPokeTracePriceHistory;
};

export class PokeTracePriceHistoryUnavailableError extends Error {}
export class PokeTracePriceHistoryTierUnavailableError extends Error {}

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

function parseStoredHistory(
  value: unknown,
  tier: MarketHistoryTier,
  market: PokeTraceMarket,
): StoredMarketPriceHistory | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const history = (parsed as Record<string, Record<string, unknown>>)[market];
    if (!history || history.market !== market) return null;
    if (
      history.condition !== tier ||
      history.period !== "1y" ||
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
      condition: tier,
      market,
      period: history.period,
      currency: history.currency,
      fetchedAt: history.fetchedAt,
      series,
    };
  } catch {
    return null;
  }
}

function groupSeries(
  points: PokeTracePriceHistoryPoint[],
  tier: MarketHistoryTier,
  market: PokeTraceMarket,
) {
  const series: MarketPriceHistory["series"] = {};
  const graded = isGradedHistoryTier(tier);
  for (const point of points) {
    const source = point.source.toLowerCase();
    if (
      market === "US"
        ? source !== "ebay" && source !== "tcgplayer"
        : source !== "cardmarket" && source !== "cardmarket_unsold"
    )
      continue;
    if (graded && source !== (market === "US" ? "ebay" : "cardmarket_unsold"))
      continue;
    const avg = point.avg ?? (graded ? point.median30d : null);
    if (!isSource(source) || !isFiniteNumber(avg)) continue;
    (series[source] ??= []).push({
      date: point.date,
      avg,
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
  const tier = dependencies.tier ?? "NEAR_MINT";
  const market = dependencies.market ?? "US";
  if (!isPokeTraceMarket(market))
    throw new PokeTracePriceHistoryTierUnavailableError("Invalid market");
  if (!isMarketHistoryTier(tier)) {
    throw new PokeTracePriceHistoryTierUnavailableError(
      "Invalid price history tier",
    );
  }
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
  const card = JSON.parse(String(row.raw_json));
  if (
    card.markets?.[market]?.available !== true ||
    typeof card.markets[market].currency !== "string"
  ) {
    throw new PokeTracePriceHistoryTierUnavailableError(
      "This market is not available for this card",
    );
  }

  let cachedPayload = row.market_price_history;
  if (tier !== "NEAR_MINT") {
    if (isGradedHistoryTier(tier)) {
      if (
        !qualifyingGradedHistoryTiers(
          card.prices,
          market === "US" ? card.gradedOptions : undefined,
          now(),
          market,
        ).includes(tier)
      ) {
        throw new PokeTracePriceHistoryTierUnavailableError(
          "This whole grade requires an available price, at least 15 sales, and an update within two months",
        );
      }
    }
    const saved = await database.execute({
      sql: "SELECT payload_json, fetched_at FROM poketrace_graded_price_history WHERE card_id = ? AND tier = ?",
      args: [cardId, tier],
    });
    cachedPayload = saved.rows[0]?.payload_json ?? null;
  }
  const cached = parseStoredHistory(cachedPayload, tier, market);
  const fetchedAt = cached ? Date.parse(cached.fetchedAt) : Number.NaN;
  if (
    cached &&
    cached.period === "1y" &&
    Number.isFinite(fetchedAt) &&
    now() - fetchedAt < CACHE_TTL_MS
  ) {
    return { cardId, ...cached, stale: false };
  }

  const cacheKey = `${cardId}:${market}:${tier}`;
  const existing = activeHistoryFetches.get(cacheKey);
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
      const response = dependencies.fetchHistory
        ? await dependencies.fetchHistory(apiKey, cardId, { market })
        : await fetchPokeTraceTierPriceHistory(apiKey, cardId, tier, {
            market,
          });
      const refreshedAt = new Date(now()).toISOString();
      const history: StoredMarketPriceHistory = {
        condition: tier,
        market,
        period: "1y",
        currency: card.markets[market].currency,
        fetchedAt: refreshedAt,
        series: groupSeries(response.data, tier, market),
      };
      await database.execute(
        tier === "NEAR_MINT"
          ? {
              sql: `
          UPDATE poketrace_cards
          SET market_price_history = json_set(COALESCE(market_price_history, '{}'), ?, json(?)), market_price_history_fetched_at = ?
          WHERE id = ?
        `,
              args: [
                `$.${market}`,
                JSON.stringify(history),
                refreshedAt,
                cardId,
              ],
            }
          : {
              sql: `
          INSERT INTO poketrace_graded_price_history (card_id, tier, payload_json, fetched_at)
          VALUES (?, ?, json_object(?, json(?)), ?)
          ON CONFLICT(card_id, tier) DO UPDATE SET
            payload_json = json_set(poketrace_graded_price_history.payload_json, ?, json(?)), fetched_at = excluded.fetched_at
        `,
              args: [
                cardId,
                tier,
                market,
                JSON.stringify(history),
                refreshedAt,
                `$.${market}`,
                JSON.stringify(history),
              ],
            },
      );
      return { cardId, ...history, stale: false };
    } catch (error) {
      if (cached) return { cardId, ...cached, stale: true };
      throw error;
    }
  })();

  if (!dependencies.fetchHistory && !dependencies.database) {
    activeHistoryFetches.set(cacheKey, refresh);
  }
  try {
    return await refresh;
  } finally {
    if (activeHistoryFetches.get(cacheKey) === refresh) {
      activeHistoryFetches.delete(cacheKey);
    }
  }
}
