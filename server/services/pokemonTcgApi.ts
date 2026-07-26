import axios from "axios";
import type { PokemonTcgApiResponse } from "../types/PokemonTcgApiResponse";

const API_URL = "https://api.pokemontcg.io/v2/cards";
const PAGE_SIZE = 250;
const REQUEST_DELAY_MS = 3000;
const MAX_RETRIES = 5;

export type PokemonTcgApiPage = PokemonTcgApiResponse & {
  retryCount: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitBetweenRequests(): Promise<void> {
  await sleep(REQUEST_DELAY_MS);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function validatePokemonTcgApiResponse(
  value: unknown,
  requestedPage: number,
): PokemonTcgApiResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Card API page ${requestedPage} returned a non-object response`);
  }

  const response = value as Partial<PokemonTcgApiResponse>;
  if (
    !Array.isArray(response.data) ||
    response.page !== requestedPage ||
    response.pageSize !== PAGE_SIZE ||
    !isSafeNonNegativeInteger(response.count) ||
    response.count !== response.data.length ||
    !isSafeNonNegativeInteger(response.totalCount) ||
    response.totalCount < response.count
  ) {
    throw new Error(
      `Card API page ${requestedPage} returned inconsistent pagination metadata`,
    );
  }

  return response as PokemonTcgApiResponse;
}

export async function getCardsPage(page: number): Promise<PokemonTcgApiPage> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.get<PokemonTcgApiResponse>(API_URL, {
        params: {
          page,
          pageSize: PAGE_SIZE,
        },
        timeout: 30000,
        headers: process.env.POKEMON_TCG_API_KEY
          ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
          : {},
      });

      return {
        ...validatePokemonTcgApiResponse(res.data, page),
        retryCount: attempt - 1,
      };
    } catch (err) {
      lastError = err;
      console.warn(`Page ${page} failed. Attempt ${attempt}/${MAX_RETRIES}`);

      if (attempt === MAX_RETRIES) {
        throw err;
      }

      await sleep(5000 * attempt);
    }
  }

  throw lastError ?? new Error(`Card API page ${page} failed without an error`);
}

export { PAGE_SIZE };
