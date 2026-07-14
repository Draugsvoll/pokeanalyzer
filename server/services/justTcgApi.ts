const JUST_TCG_API_URL = "https://api.justtcg.com/v1/cards";

export class JustTcgApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "JustTcgApiError";
  }
}

export async function fetchJustTcgCard(name: string, number: string): Promise<unknown> {
  const apiKey = process.env.JUSTTCG_API_KEY ?? process.env.VITE_JUSTTCG_API_KEY;

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
    signal: AbortSignal.timeout(30000),
  });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `JustTCG request failed: ${response.status}`;
    throw new JustTcgApiError(message, response.status);
  }

  return data;
}
