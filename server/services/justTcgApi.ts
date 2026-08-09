const JUST_TCG_API_URL = "https://api.justtcg.com/v1/cards";

type JustTcgFetchMethod = "biggestGainers" | "biggestLosers";
export type JustTcgMovementPeriod = "24h" | "7d" | "30d";
type JsonRecord = Record<string, unknown>;

type JustTcgFetchConfig = {
  condition: string;
  includePriceHistory: boolean;
  includeStatistics: string;
  limit: number;
  minPrice: number;
  order: "asc" | "desc";
  orderBy: JustTcgMovementPeriod;
};

export type JustTcgPriceMovement = {
  absoluteChange?: number;
  cardName: string;
  changePercent?: number;
  condition: string;
  currentPrice: number;
  period: JustTcgMovementPeriod;
  printing: string;
  setName?: string;
};

export type JustTcgCardIdentityCandidate = {
  id: string;
  name: string;
  number?: string;
  setName?: string;
};

export type JustTcgPortfolioPrice = {
  absoluteChange24h?: number;
  absoluteChange7d?: number;
  absoluteChange30d?: number;
  cardId: string;
  cardName: string;
  condition: string;
  market: number;
  number?: string;
  percentChange24h?: number;
  percentChange7d?: number;
  percentChange30d?: number;
  printing: string;
  setName?: string;
};

const JUST_TCG_FETCH_CONFIGS: Record<JustTcgFetchMethod, JustTcgFetchConfig> = {
  biggestGainers: {
    condition: "NM,LP",
    includePriceHistory: false,
    includeStatistics: "7d",
    limit: 20,
    minPrice: 15,
    order: "desc",
    orderBy: "7d",
  },
  biggestLosers: {
    condition: "NM,LP",
    includePriceHistory: false,
    includeStatistics: "7d",
    limit: 20,
    minPrice: 15,
    order: "asc",
    orderBy: "7d",
  },
};
const JUST_TCG_PORTFOLIO_BATCH_ROW_LIMIT = 20;

export class JustTcgApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "JustTcgApiError";
    this.statusCode = statusCode;
  }
}

function getApiKey() {
  const apiKey = process.env.JUSTTCG_API_KEY?.trim();

  if (!apiKey) {
    throw new JustTcgApiError("JUSTTCG_API_KEY is not configured", 500);
  }

  return apiKey;
}

function getAbortSignal(signal?: AbortSignal) {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
}

async function fetchJustTcgCards(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${JUST_TCG_API_URL}?${params}`, {
    headers: { "x-api-key": getApiKey() },
    signal: getAbortSignal(signal),
  });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new JustTcgApiError("JustTCG request failed", response.status);
  }

  return data;
}

async function fetchJustTcgCardsBatch(
  params: URLSearchParams,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${JUST_TCG_API_URL}?${params}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
    method: "POST",
    signal: getAbortSignal(signal),
  });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new JustTcgApiError("JustTCG batch request failed", response.status);
  }

  return data;
}

export async function fetchJustTcgCard(
  name: string,
  number: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const params = new URLSearchParams({
    game: "pokemon",
    q: name,
    number,
    include_price_history: "true",
    include_statistics: "allTime",
    priceHistoryDuration: "180d",
    limit: "20",
  });

  return fetchJustTcgCards(params, signal);
}

export async function fetchJustTcgCardIdentityCandidates(
  name: string,
  number: string,
  signal?: AbortSignal,
): Promise<JustTcgCardIdentityCandidate[]> {
  const params = new URLSearchParams({
    game: "pokemon",
    include_price_history: "false",
    limit: "20",
    number,
    q: name,
  });

  const response = await fetchJustTcgCards(params, signal);
  if (!isRecord(response) || !Array.isArray(response.data)) return [];

  return response.data
    .map(parseCardIdentityCandidate)
    .filter((candidate): candidate is JustTcgCardIdentityCandidate =>
      Boolean(candidate),
    );
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$€£\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNestedNumber(
  record: JsonRecord,
  paths: string[][],
): number | undefined {
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }

    const value = optionalNumber(current);
    if (value !== undefined) return value;
  }

  return undefined;
}

function getChangePercent(
  variant: JsonRecord,
  timeframe: JustTcgFetchConfig["orderBy"],
) {
  const legacy24hKey = timeframe === "24h" ? "24hr" : timeframe;

  return getNestedNumber(variant, [
    ["statistics", timeframe, "priceChangePercentage"],
    ["statistics", timeframe, "changePercentage"],
    ["statistics", timeframe, "percentChange"],
    ["statistics", timeframe, "change"],
    ["stats", timeframe, "priceChangePercentage"],
    ["stats", timeframe, "changePercentage"],
    ["stats", timeframe, "percentChange"],
    ["stats", timeframe, "change"],
    [`priceChangePercentage${timeframe}`],
    [`priceChange${timeframe}`],
    [`priceChange${legacy24hKey}`],
    [`changePercentage${timeframe}`],
    [`percentChange${timeframe}`],
    [`change${timeframe}`],
  ]);
}

function getAbsoluteChange(
  variant: JsonRecord,
  timeframe: JustTcgFetchConfig["orderBy"],
) {
  return getNestedNumber(variant, [
    ["statistics", timeframe, "priceChange"],
    ["statistics", timeframe, "absoluteChange"],
    ["statistics", timeframe, "changeAmount"],
    ["stats", timeframe, "priceChange"],
    ["stats", timeframe, "absoluteChange"],
    ["stats", timeframe, "changeAmount"],
    [`priceChange${timeframe}`],
    [`absoluteChange${timeframe}`],
    [`changeAmount${timeframe}`],
  ]);
}

function parseCardIdentityCandidate(
  card: unknown,
): JustTcgCardIdentityCandidate | null {
  if (!isRecord(card)) return null;

  const id = optionalString(card.id) ?? optionalString(card.uuid);
  const name = optionalString(card.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    number: optionalString(card.number),
    setName: optionalString(card.set_name),
  };
}

function formatJustTcgVariantKey(printing: string, condition: string) {
  return [printing, condition]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parsePortfolioPriceResponse(
  response: unknown,
): Record<string, JustTcgPortfolioPrice> {
  const prices: Record<string, JustTcgPortfolioPrice> = {};
  if (!isRecord(response) || !Array.isArray(response.data)) return prices;

  for (const card of response.data) {
    if (!isRecord(card) || !Array.isArray(card.variants)) continue;

    const cardId = optionalString(card.id) ?? optionalString(card.uuid);
    const cardName = optionalString(card.name);
    if (!cardId || !cardName) continue;

    const setName = optionalString(card.set_name);
    const number = optionalString(card.number);

    for (const variant of card.variants) {
      if (!isRecord(variant)) continue;

      const market = optionalNumber(variant.price);
      if (market === undefined) continue;

      const condition = optionalString(variant.condition) ?? "Near Mint";
      const printing = optionalString(variant.printing) ?? "JustTCG";
      const variantKey =
        formatJustTcgVariantKey(printing, condition) || "justtcg";
      const key = `${cardId}:${variantKey}`;

      prices[key] = {
        absoluteChange24h: getAbsoluteChange(variant, "24h"),
        absoluteChange7d: getAbsoluteChange(variant, "7d"),
        absoluteChange30d: getAbsoluteChange(variant, "30d"),
        cardId,
        cardName,
        condition,
        market,
        number,
        percentChange24h: getChangePercent(variant, "24h"),
        percentChange7d: getChangePercent(variant, "7d"),
        percentChange30d: getChangePercent(variant, "30d"),
        printing,
        setName,
      };
    }
  }

  return prices;
}

export async function fetchJustTcgPortfolioPricesByCardIds(
  cardIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, JustTcgPortfolioPrice>> {
  const uniqueCardIds = Array.from(
    new Set(cardIds.map((cardId) => cardId.trim()).filter(Boolean)),
  );
  if (uniqueCardIds.length === 0) return {};

  const params = new URLSearchParams({
    include_price_history: "false",
    include_statistics: "24h,7d,30d",
  });
  const requestRows = uniqueCardIds.map((cardId) => ({ cardId }));
  const prices: Record<string, JustTcgPortfolioPrice> = {};

  for (
    let offset = 0;
    offset < requestRows.length;
    offset += JUST_TCG_PORTFOLIO_BATCH_ROW_LIMIT
  ) {
    const response = await fetchJustTcgCardsBatch(
      params,
      requestRows.slice(offset, offset + JUST_TCG_PORTFOLIO_BATCH_ROW_LIMIT),
      signal,
    );
    Object.assign(prices, parsePortfolioPriceResponse(response));
  }

  return prices;
}

function isLikelySealedProduct(cardName: string) {
  return /\b(booster|box|bundle|display|elite trainer|etb|tin|case|pack|collection|deck|blister)\b/i.test(
    cardName,
  );
}

function parsePriceMovementResponse(
  response: unknown,
  config: JustTcgFetchConfig,
): JustTcgPriceMovement[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];

  const priceMovements: JustTcgPriceMovement[] = [];
  for (const card of response.data) {
    if (!isRecord(card) || !Array.isArray(card.variants)) continue;

    const cardName = optionalString(card.name);
    if (!cardName || isLikelySealedProduct(cardName)) continue;

    const setName = optionalString(card.set_name);
    for (const variant of card.variants) {
      if (!isRecord(variant)) continue;

      const currentPrice = optionalNumber(variant.price);
      if (currentPrice === undefined || currentPrice < config.minPrice)
        continue;

      const condition = optionalString(variant.condition) ?? config.condition;
      if (!/^near mint$|^nm$|^lightly played$|^lp$/i.test(condition)) continue;

      const changePercent = getChangePercent(variant, config.orderBy);
      if (changePercent === undefined) continue;
      if (config.order === "desc" && changePercent <= 0) continue;
      if (config.order === "asc" && changePercent >= 0) continue;

      priceMovements.push({
        absoluteChange: getAbsoluteChange(variant, config.orderBy),
        cardName,
        changePercent,
        condition,
        currentPrice,
        period: config.orderBy,
        printing: optionalString(variant.printing) ?? "JustTCG",
        setName,
      });
    }
  }

  return priceMovements.sort((first, second) => {
    const firstPercent = first.changePercent ?? 0;
    const secondPercent = second.changePercent ?? 0;
    if (secondPercent !== firstPercent) {
      return config.order === "asc"
        ? firstPercent - secondPercent
        : secondPercent - firstPercent;
    }

    return config.order === "asc"
      ? (first.absoluteChange ?? 0) - (second.absoluteChange ?? 0)
      : (second.absoluteChange ?? 0) - (first.absoluteChange ?? 0);
  });
}

async function fetchJustTcgPriceMovements(
  method: JustTcgFetchMethod,
  signal?: AbortSignal,
  period: JustTcgMovementPeriod = JUST_TCG_FETCH_CONFIGS[method].orderBy,
) {
  const config = {
    ...JUST_TCG_FETCH_CONFIGS[method],
    includeStatistics: period,
    orderBy: period,
  };
  const params = new URLSearchParams({
    condition: config.condition,
    game: "pokemon",
    include_price_history: String(config.includePriceHistory),
    include_statistics: config.includeStatistics,
    limit: String(config.limit),
    min_price: String(config.minPrice),
    order: config.order,
    orderBy: config.orderBy,
  });

  const data = await fetchJustTcgCards(params, signal);
  return parsePriceMovementResponse(data, config).slice(0, config.limit);
}

export async function fetchJustTcgBiggestGainers(
  signal?: AbortSignal,
  period: JustTcgMovementPeriod = JUST_TCG_FETCH_CONFIGS.biggestGainers.orderBy,
) {
  return fetchJustTcgPriceMovements("biggestGainers", signal, period);
}

export async function fetchJustTcgBiggestLosers(
  signal?: AbortSignal,
  period: JustTcgMovementPeriod = JUST_TCG_FETCH_CONFIGS.biggestLosers.orderBy,
) {
  return fetchJustTcgPriceMovements("biggestLosers", signal, period);
}
