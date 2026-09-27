import type { PokemonCard } from "../types/pokemon";
import type { PokeTraceSearchResponse } from "../../shared/pokeTraceSearch";
import { runWithRequestTimeout } from "../utils/requestTimeout";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function cacheKey(setName: string) {
  return setName.trim().toLocaleLowerCase("en-US");
}

function isPokemonCard(value: unknown): value is PokemonCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Partial<PokemonCard>;
  return Boolean(
    typeof card.id === "string" &&
    card.id &&
    typeof card.name === "string" &&
    card.name &&
    card.set &&
    typeof card.set.name === "string" &&
    card.pokeTrace &&
    typeof card.pokeTrace === "object",
  );
}

export async function loadPokeTraceSetCards(
  setName: string,
  signal?: AbortSignal,
) {
  const key = cacheKey(setName);
  const params = new URLSearchParams({ setName: setName.trim() });
  return runWithRequestTimeout(
    async (requestSignal) => {
      const response = await fetch(`${API_URL}/api/cards/set?${params}`, {
        signal: requestSignal,
      });
      if (!response.ok) {
        throw new Error(`Set request failed with status ${response.status}`);
      }

      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Set request returned an invalid response");
      }
      const result = value as Partial<PokeTraceSearchResponse<PokemonCard>>;
      if (
        !Array.isArray(result.items) ||
        !result.items.every(
          (card) => isPokemonCard(card) && cacheKey(card.set.name) === key,
        ) ||
        !Number.isSafeInteger(result.total) ||
        result.total !== result.items.length
      ) {
        throw new Error("Set request returned an invalid response");
      }

      return result.items;
    },
    { signal },
  );
}
