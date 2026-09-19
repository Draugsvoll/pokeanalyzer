export type PokeTraceCard = Record<string, unknown> & {
  id: string;
  name: string;
  cardNumber?: string | null;
  set?: { name?: string | null } | null;
  rarity?: string | null;
  variant?: string | null;
  image?: string | null;
  refs?: { tcgplayerId?: string | number | null } | null;
  game: "pokemon";
  market: "US";
  productType: "single";
};

export type PokeTracePage = {
  data: PokeTraceCard[];
  pagination: { hasMore: boolean; nextCursor: string | null };
};

export type PokeTraceRetryEvent = {
  resource: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: string;
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

export async function fetchPokeTracePage(
  apiKey: string,
  filters: Record<string, string>,
  options?: PokeTraceRequestOptions,
): Promise<PokeTracePage> {
  const params = new URLSearchParams({
    game: "pokemon",
    market: "US",
    product_type: "single",
    limit: "20",
    ...filters,
  });
  const response = await pokeTraceFetch(
    `https://api.poketrace.com/v1/cards?${params}`,
    apiKey,
    "card list",
    options,
  );
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PokeTrace returned an invalid card page");
  }
  const page = value as Record<string, unknown>;
  const pagination = page.pagination as Record<string, unknown> | undefined;
  if (
    !Array.isArray(page.data) ||
    page.data.length > 20 ||
    !page.data.every(isEnglishSingle) ||
    !pagination ||
    typeof pagination.hasMore !== "boolean" ||
    (pagination.hasMore &&
      (typeof pagination.nextCursor !== "string" ||
        pagination.nextCursor.length === 0))
  ) {
    throw new Error("PokeTrace returned an invalid card page");
  }
  return {
    data: page.data,
    pagination: {
      hasMore: pagination.hasMore,
      nextCursor:
        typeof pagination.nextCursor === "string"
          ? pagination.nextCursor
          : null,
    },
  };
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
