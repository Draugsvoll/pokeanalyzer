export type PokeTraceCard = Record<string, unknown> & {
  id: string;
  name: string;
  cardNumber?: string | null;
  set?: { name?: string | null; slug?: string | null } | null;
  rarity?: string | null;
  variant?: string | null;
  image?: string | null;
  refs?: {
    cardmarketId?: string | number | null;
    tcgplayerId?: string | number | null;
  } | null;
  marketplaceUrls?: Record<string, unknown> | null;
  game: "pokemon";
  market: "US";
  productType: "single";
};

export type PokeTraceSealedProduct = Record<string, unknown> & {
  id: string;
  name: string;
  cardNumber?: null;
  set?: { name?: string | null; slug?: string | null } | null;
  rarity?: null;
  variant?: string | null;
  image?: string | null;
  refs?: {
    cardmarketId?: string | number | null;
    tcgplayerId?: string | number | null;
  } | null;
  marketplaceUrls?: Record<string, unknown> | null;
  game: "pokemon";
  market: "US";
  productType: "sealed";
  productFamily: string;
};

export type PokeTracePage = {
  data: PokeTraceCard[];
  pagination: { hasMore: boolean; nextCursor: string | null };
};

export type PokeTraceSealedPage = {
  data: PokeTraceSealedProduct[];
  pagination: { hasMore: boolean; nextCursor: string | null };
};

export type PokeTraceRetryEvent = {
  resource: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: string;
};

export type PokeTracePriceHistoryPoint = {
  date: string;
  source: string;
  avg: number | null;
  median7d: number | null;
  median30d: number | null;
  low: number | null;
  high: number | null;
  saleCount: number | null;
  approxSaleCount: boolean | null;
};

export type PokeTracePriceHistoryResponse = {
  data: PokeTracePriceHistoryPoint[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
};

type PokeTraceRequestOptions = {
  onRetry?: (event: PokeTraceRetryEvent) => void;
};

export const POKETRACE_CARD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PokeTraceHttpError extends Error {
  readonly status: number;

  constructor(status: number, resource: string) {
    super(`PokeTrace ${resource} returned HTTP ${status}`);
    this.status = status;
  }
}

export class PokeTraceDailyLimitError extends PokeTraceHttpError {
  constructor(resource: string) {
    super(429, resource);
    this.name = "PokeTraceDailyLimitError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const transientRetries = 2;

function retryDelayMs(attempt: number, response?: Response, minimumMs = 500) {
  const retryAfter = Number(response?.headers.get("Retry-After"));
  const requestedDelay =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : minimumMs * 2 ** attempt;
  return Math.min(30_000, Math.max(minimumMs, requestedDelay));
}

async function waitForRetry(
  resource: string,
  attempt: number,
  reason: string,
  response?: Response,
  minimumMs = 500,
  onRetry?: PokeTraceRequestOptions["onRetry"],
) {
  const delayMs = retryDelayMs(attempt, response, minimumMs);
  const event = {
    resource,
    attempt: attempt + 1,
    maxAttempts: transientRetries,
    delayMs,
    reason,
  };
  if (onRetry) onRetry(event);
  else
    console.warn(
      `PokeTrace ${resource} failed temporarily (${reason}); retry ${event.attempt}/${event.maxAttempts} in ${delayMs}ms`,
    );
  await sleep(delayMs);
}

async function pokeTraceFetch(
  url: string,
  apiKey: string,
  resource: string,
  options?: PokeTraceRequestOptions,
) {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt >= transientRetries) throw error;
      const reason =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      await waitForRetry(
        resource,
        attempt,
        reason,
        undefined,
        500,
        options?.onRetry,
      );
      continue;
    }

    if (response.ok) return response;

    if (response.status === 429) {
      const body: unknown = await response.json().catch(() => null);
      const details =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {};
      const usage = details.usage as Record<string, unknown> | undefined;
      const daily = usage?.daily as Record<string, unknown> | undefined;
      if (
        daily?.remaining === 0 ||
        response.headers.get("X-RateLimit-Remaining") === "0" ||
        (typeof details.error === "string" &&
          details.error.toLowerCase().includes("daily rate limit"))
      ) {
        throw new PokeTraceDailyLimitError(resource);
      }
      if (
        details.code !== "BURST_RATE_LIMIT_EXCEEDED" ||
        attempt >= transientRetries
      ) {
        throw new PokeTraceHttpError(429, resource);
      }
      await waitForRetry(
        resource,
        attempt,
        "burst rate limit",
        response,
        2_100,
        options?.onRetry,
      );
      continue;
    }

    if (
      [408, 425].includes(response.status) ||
      (response.status >= 500 && response.status <= 599)
    ) {
      if (attempt >= transientRetries) {
        throw new PokeTraceHttpError(response.status, resource);
      }
      await waitForRetry(
        resource,
        attempt,
        `HTTP ${response.status}`,
        response,
        500,
        options?.onRetry,
      );
      continue;
    }

    throw new PokeTraceHttpError(response.status, resource);
  }
}

export function isEnglishSingle(value: unknown): value is PokeTraceCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.id === "string" &&
    POKETRACE_CARD_ID_PATTERN.test(card.id) &&
    typeof card.name === "string" &&
    card.name.length > 0 &&
    card.game === "pokemon" &&
    card.market === "US" &&
    card.productType === "single"
  );
}

export function isEnglishUsSealedProduct(
  value: unknown,
): value is PokeTraceSealedProduct {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === "string" &&
    POKETRACE_CARD_ID_PATTERN.test(product.id) &&
    typeof product.name === "string" &&
    product.name.length > 0 &&
    product.game === "pokemon" &&
    product.market === "US" &&
    product.productType === "sealed" &&
    typeof product.productFamily === "string" &&
    product.productFamily.length > 0
  );
}

async function fetchPokeTraceProductPage<T>(
  apiKey: string,
  filters: Record<string, string>,
  productType: "single" | "sealed",
  isProduct: (value: unknown) => value is T,
  resource: string,
  options?: PokeTraceRequestOptions,
): Promise<{
  data: T[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}> {
  const params = new URLSearchParams({
    ...filters,
    game: "pokemon",
    market: "US",
    product_type: productType,
    limit: "20",
  });
  const response = await pokeTraceFetch(
    `https://api.poketrace.com/v1/cards?${params}`,
    apiKey,
    resource,
    options,
  );
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`PokeTrace returned an invalid ${resource}`);
  }
  const page = value as Record<string, unknown>;
  const pagination = page.pagination as Record<string, unknown> | undefined;
  if (
    !Array.isArray(page.data) ||
    page.data.length > 20 ||
    !page.data.every(isProduct) ||
    !pagination ||
    typeof pagination.hasMore !== "boolean" ||
    (pagination.hasMore &&
      (typeof pagination.nextCursor !== "string" ||
        pagination.nextCursor.length === 0 ||
        page.data.length === 0))
  ) {
    throw new Error(`PokeTrace returned an invalid ${resource}`);
  }
  return {
    data: page.data as T[],
    pagination: {
      hasMore: pagination.hasMore,
      nextCursor:
        typeof pagination.nextCursor === "string"
          ? pagination.nextCursor
          : null,
    },
  };
}

export function fetchPokeTracePage(
  apiKey: string,
  filters: Record<string, string>,
  options?: PokeTraceRequestOptions,
): Promise<PokeTracePage> {
  return fetchPokeTraceProductPage(
    apiKey,
    filters,
    "single",
    isEnglishSingle,
    "card page",
    options,
  );
}

export function fetchPokeTraceSealedPage(
  apiKey: string,
  filters: Record<string, string>,
  options?: PokeTraceRequestOptions,
): Promise<PokeTraceSealedPage> {
  return fetchPokeTraceProductPage(
    apiKey,
    filters,
    "sealed",
    isEnglishUsSealedProduct,
    "sealed-product page",
    options,
  );
}

export async function fetchPokeTraceCard(
  apiKey: string,
  id: string,
  options?: PokeTraceRequestOptions,
) {
  const response = await pokeTraceFetch(
    `https://api.poketrace.com/v1/cards/${encodeURIComponent(id)}`,
    apiKey,
    `card ${id}`,
    options,
  );
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`PokeTrace card ${id} returned invalid data`);
  }
  const card = (value as { data?: unknown }).data;
  if (!isEnglishSingle(card) || card.id !== id) {
    throw new Error(`PokeTrace card ${id} returned invalid data`);
  }
  return card;
}

export async function fetchPokeTraceSealedProduct(
  apiKey: string,
  id: string,
  options?: PokeTraceRequestOptions,
) {
  const response = await pokeTraceFetch(
    `https://api.poketrace.com/v1/cards/${encodeURIComponent(id)}`,
    apiKey,
    `sealed product ${id}`,
    options,
  );
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`PokeTrace sealed product ${id} returned invalid data`);
  }
  const product = (value as { data?: unknown }).data;
  if (!isEnglishUsSealedProduct(product) || product.id !== id) {
    throw new Error(`PokeTrace sealed product ${id} returned invalid data`);
  }
  return product;
}

function nullableFiniteNumber(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`PokeTrace price history contains an invalid ${field}`);
  }
  return value;
}

async function fetchPokeTracePriceHistoryForCondition(
  apiKey: string,
  id: string,
  condition: "NEAR_MINT" | "UNOPENED",
  options?: PokeTraceRequestOptions,
): Promise<PokeTracePriceHistoryResponse> {
  const params = new URLSearchParams({ period: "90d", limit: "365" });
  const response = await pokeTraceFetch(
    `https://api.poketrace.com/v1/cards/${encodeURIComponent(id)}/prices/${condition}/history?${params}`,
    apiKey,
    `price history for card ${id}`,
    options,
  );
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`PokeTrace price history for card ${id} is invalid`);
  }

  const result = value as Record<string, unknown>;
  const pagination = result.pagination as Record<string, unknown> | undefined;
  if (
    !Array.isArray(result.data) ||
    !pagination ||
    typeof pagination.hasMore !== "boolean"
  ) {
    throw new Error(`PokeTrace price history for card ${id} is invalid`);
  }

  const data = result.data.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`PokeTrace price history for card ${id} is invalid`);
    }
    const row = entry as Record<string, unknown>;
    if (
      typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      typeof row.source !== "string"
    ) {
      throw new Error(`PokeTrace price history for card ${id} is invalid`);
    }
    if (
      row.approxSaleCount !== null &&
      row.approxSaleCount !== undefined &&
      typeof row.approxSaleCount !== "boolean"
    ) {
      throw new Error(
        `PokeTrace price history contains an invalid approxSaleCount`,
      );
    }

    return {
      date: row.date,
      source: row.source,
      avg: nullableFiniteNumber(row.avg, "avg"),
      median7d: nullableFiniteNumber(row.median7d, "median7d"),
      median30d: nullableFiniteNumber(row.median30d, "median30d"),
      low: nullableFiniteNumber(row.low, "low"),
      high: nullableFiniteNumber(row.high, "high"),
      saleCount: nullableFiniteNumber(row.saleCount, "saleCount"),
      approxSaleCount:
        typeof row.approxSaleCount === "boolean" ? row.approxSaleCount : null,
    };
  });

  return {
    data,
    pagination: {
      hasMore: pagination.hasMore,
      nextCursor:
        typeof pagination.nextCursor === "string"
          ? pagination.nextCursor
          : null,
    },
  };
}

export function fetchPokeTracePriceHistory(
  apiKey: string,
  id: string,
  options?: PokeTraceRequestOptions,
) {
  return fetchPokeTracePriceHistoryForCondition(
    apiKey,
    id,
    "NEAR_MINT",
    options,
  );
}

export function fetchPokeTraceSealedPriceHistory(
  apiKey: string,
  id: string,
  options?: PokeTraceRequestOptions,
) {
  return fetchPokeTracePriceHistoryForCondition(
    apiKey,
    id,
    "UNOPENED",
    options,
  );
}
