const JUST_TCG_API_URL = "https://api.justtcg.com/v1/cards";

export class JustTcgApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "JustTcgApiError";
    this.statusCode = statusCode;
  }
}

export async function fetchJustTcgCard(
  name: string,
  number: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const apiKey = process.env.JUSTTCG_API_KEY?.trim();

  if (!apiKey) {
    throw new JustTcgApiError("JUSTTCG_API_KEY is not configured", 500);
  }

  const params = new URLSearchParams({
    game: "pokemon",
    q: name,
    number,
    include_price_history: "true",
    include_statistics: "allTime",
    limit: "20",
  });

  const response = await fetch(`${JUST_TCG_API_URL}?${params}`, {
    headers: { "x-api-key": apiKey },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      : AbortSignal.timeout(30_000),
  });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new JustTcgApiError("JustTCG request failed", response.status);
  }

  return data;
}
