const BASE_URL = "https://api.justtcg.com/v1";

export class JustTcgApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "JustTcgApiError";
    this.statusCode = statusCode;
  }
}

export type JustTcgVariant = {
  id: string;
  condition: string;
  printing: string;
  price: number;
};

export type JustTcgCard = {
  id: string;
  name: string;
  game: string;
  set: string;
  set_name?: string;
  number: string | null;
  rarity: string | null;
  variants: JustTcgVariant[];
};

export type JustTcgCardsResponse = {
  data: JustTcgCard[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  usage?: {
    apiDailyRequestsRemaining?: number;
  };
  error?: string;
};

function getApiKey() {
  const apiKey =
    process.env.VITE_JUSTTCG_API_KEY?.trim() ??
    process.env.JUSTTCG_API_KEY?.trim();

  if (!apiKey) {
    throw new JustTcgApiError(
      "VITE_JUSTTCG_API_KEY is not configured in .env",
      500
    );
  }

  return apiKey;
}

export async function fetchPokemonCards(options?: {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: "asc" | "desc";
  query?: string;
}): Promise<JustTcgCardsResponse> {
  const {
    limit = 20,
    offset = 0,
    orderBy = "price",
    order = "desc",
    query,
  } = options ?? {};

  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("game", "pokemon");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("orderBy", orderBy);
  url.searchParams.set("order", order);

  if (query) {
    url.searchParams.set("q", query);
  }

  const res = await fetch(url, {
    headers: { "x-api-key": getApiKey() },
  });

  const data = (await res.json()) as JustTcgCardsResponse;

  if (!res.ok) {
    throw new JustTcgApiError(
      data.error ?? `JustTCG request failed: ${res.status}`,
      res.status
    );
  }

  if (data.error) {
    throw new JustTcgApiError(data.error, 400);
  }

  return data;
}