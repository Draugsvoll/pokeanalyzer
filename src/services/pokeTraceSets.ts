import type { PokemonCard } from "../types/pokemon";
import {
  type PokeTraceSetResponse,
  type PokeTraceSetSalesLeaders,
} from "../../shared/pokeTraceSet";
import { runWithRequestTimeout } from "../utils/requestTimeout";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type LoadedPokeTraceSet = {
  cards: PokemonCard[];
  salesLeaders: PokeTraceSetSalesLeaders;
};

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

function isSalesLeader(value: unknown) {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const leader = value as {
    approximate?: unknown;
    cardId?: unknown;
    sales?: unknown;
  };
  return (
    typeof leader.approximate === "boolean" &&
    typeof leader.cardId === "string" &&
    Boolean(leader.cardId) &&
    typeof leader.sales === "number" &&
    Number.isFinite(leader.sales) &&
    leader.sales >= 0
  );
}

function isSalesLeaders(value: unknown): value is PokeTraceSetSalesLeaders {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const leaders = value as Partial<PokeTraceSetSalesLeaders>;
  return Boolean(
    isSalesLeader(leaders.total) && isSalesLeader(leaders.leastTotal),
  );
}

function unavailableSalesLeaders(): PokeTraceSetSalesLeaders {
  return { leastTotal: null, total: null };
}

export function isLoadedPokeTraceSet(
  value: unknown,
  setName: string,
): value is LoadedPokeTraceSet {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<LoadedPokeTraceSet>;
  const key = cacheKey(setName);
  return Boolean(
    Array.isArray(result.cards) &&
    result.cards.every(
      (card) => isPokemonCard(card) && cacheKey(card.set.name) === key,
    ) &&
    isSalesLeaders(result.salesLeaders),
  );
}

export async function loadPokeTraceSet(
  setName: string,
  signal?: AbortSignal,
): Promise<LoadedPokeTraceSet> {
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
      const result = value as Partial<PokeTraceSetResponse<PokemonCard>>;
      if (
        !Array.isArray(result.items) ||
        !result.items.every(
          (card) => isPokemonCard(card) && cacheKey(card.set.name) === key,
        ) ||
        !Number.isSafeInteger(result.total) ||
        result.total !== result.items.length ||
        (result.salesLeaders !== undefined &&
          !isSalesLeaders(result.salesLeaders))
      ) {
        throw new Error("Set request returned an invalid response");
      }

      return {
        cards: result.items,
        salesLeaders: result.salesLeaders ?? unavailableSalesLeaders(),
      };
    },
    { signal },
  );
}
