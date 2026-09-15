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

async function pokeTraceFetch(url: string, apiKey: string, resource: string) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) return response;
    if (response.status !== 429) {
      throw new PokeTraceHttpError(response.status, resource);
    }

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
    if (details.code !== "BURST_RATE_LIMIT_EXCEEDED" || attempt >= 3) {
      throw new PokeTraceHttpError(429, resource);
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2_000 * 2 ** attempt;
    await sleep(Math.min(30_000, Math.max(2_100, delayMs)));
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

export async function fetchPokeTraceCard(apiKey: string, id: string) {
  const response = await pokeTraceFetch(
    `https://api.poketrace.com/v1/cards/${encodeURIComponent(id)}`,
    apiKey,
    `card ${id}`,
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
