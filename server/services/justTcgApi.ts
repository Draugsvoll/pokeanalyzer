const JUST_TCG_API_URL = "https://api.justtcg.com/v1/cards";

type JustTcgFetchMethod = "biggestGainers";
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

const JUST_TCG_FETCH_CONFIGS: Record<JustTcgFetchMethod, JustTcgFetchConfig> = {
  biggestGainers: {
    condition: "NM",
    includePriceHistory: false,
    includeStatistics: "7d",
    limit: 50,
    minPrice: 15,
    order: "desc",
    orderBy: "7d",
  },
};

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

function getNestedNumber(record: JsonRecord, paths: string[][]): number | undefined {
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

function getChangePercent(variant: JsonRecord, timeframe: JustTcgFetchConfig["orderBy"]) {
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
    [`changePercentage${timeframe}`],
    [`percentChange${timeframe}`],
    [`change${timeframe}`],
  ]);
}

function getAbsoluteChange(variant: JsonRecord, timeframe: JustTcgFetchConfig["orderBy"]) {
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
      if (currentPrice === undefined || currentPrice < config.minPrice) continue;

      const condition = optionalString(variant.condition) ?? config.condition;
      if (!/^near mint$|^nm$/i.test(condition)) continue;

      const changePercent = getChangePercent(variant, config.orderBy);
      if (changePercent !== undefined && changePercent <= 0) continue;

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
    const firstPercent = first.changePercent ?? Number.NEGATIVE_INFINITY;
    const secondPercent = second.changePercent ?? Number.NEGATIVE_INFINITY;
    if (secondPercent !== firstPercent) return secondPercent - firstPercent;

    return (second.absoluteChange ?? 0) - (first.absoluteChange ?? 0);
  });
}

export async function fetchJustTcgBiggestGainers(
  signal?: AbortSignal,
  period: JustTcgMovementPeriod = JUST_TCG_FETCH_CONFIGS.biggestGainers.orderBy,
) {
  const config = {
    ...JUST_TCG_FETCH_CONFIGS.biggestGainers,
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
