import { authenticatedFetch } from "./authenticatedFetch";
import { isVerifiedJustTcgCard } from "../../shared/justTcgCardVerification";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function fetchJustTcgCard(
  name: string,
  number: string | number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    name,
    number: String(number),
  });

  const response = await authenticatedFetch(
    `${API_URL}/api/justtcg-card?${params}`,
    {
      signal,
    },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(error.message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

export function verifyJustTcgCard(
  result: unknown,
  setName: string,
  number: string | number,
): unknown {
  if (
    !result ||
    typeof result !== "object" ||
    !("data" in result) ||
    !Array.isArray(result.data)
  ) {
    return result;
  }

  const matchingCards = result.data.filter((card) => {
    if (card === null || typeof card !== "object" || !("number" in card)) {
      return false;
    }

    return isVerifiedJustTcgCard(card, setName, number);
  });

  return { ...result, data: matchingCards };
}
