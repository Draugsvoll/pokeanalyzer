import axios from "axios";
import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard.js";
import type {
  PokemonTcgApiPaginatedResponse,
  PokemonTcgApiResponse,
} from "../types/PokemonTcgApiResponse.js";
import type { PokemonTcgApiSet } from "../types/PokemonTcgApiSet.js";

const CARDS_API_URL = "https://api.pokemontcg.io/v2/cards";
const SETS_API_URL = "https://api.pokemontcg.io/v2/sets";
export const CARD_PAGE_SIZE = 250;
export const SET_PAGE_SIZE = 250;
const REQUEST_DELAY_MS = 3000;
const MAX_RETRIES = 5;

type RetriedPage<T> = PokemonTcgApiPaginatedResponse<T> & {
  retryCount: number;
};

export type PokemonTcgApiPage = RetriedPage<PokemonTcgApiCard>;
export type PokemonTcgApiSetPage = RetriedPage<PokemonTcgApiSet>;
export type PokemonTcgApiCatalogCount = {
  retryCount: number;
  totalCount: number;
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

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validatePokemonTcgPaginatedResponse<T>(
  value: unknown,
  requestedPage: number,
  requestedPageSize: number,
  scope: string,
): PokemonTcgApiPaginatedResponse<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${scope} returned a non-object response`);
  }

  const response = value as Partial<PokemonTcgApiPaginatedResponse<T>>;
  if (
    !Array.isArray(response.data) ||
    response.page !== requestedPage ||
    response.pageSize !== requestedPageSize ||
    !isSafeNonNegativeInteger(response.count) ||
    response.count !== response.data.length ||
    !isSafeNonNegativeInteger(response.totalCount) ||
    response.totalCount < response.count
  ) {
    throw new Error(`${scope} returned inconsistent pagination metadata`);
  }

  return response as PokemonTcgApiPaginatedResponse<T>;
}

export function validatePokemonTcgApiResponse(
  value: unknown,
  requestedPage: number,
): PokemonTcgApiResponse {
  return validatePokemonTcgPaginatedResponse<PokemonTcgApiCard>(
    value,
    requestedPage,
    CARD_PAGE_SIZE,
    `Card API page ${requestedPage}`,
  );
}

function validateSet(set: unknown, index: number): PokemonTcgApiSet {
  if (!set || typeof set !== "object" || Array.isArray(set)) {
    throw new Error(`Sets API returned a non-object set at index ${index}`);
  }
  const candidate = set as Partial<PokemonTcgApiSet>;
  if (!hasText(candidate.id) || !hasText(candidate.name)) {
    throw new Error(`Sets API returned an incomplete set at index ${index}`);
  }
  return candidate as PokemonTcgApiSet;
}

export function validatePokemonTcgApiSetResponse(
  value: unknown,
  requestedPage: number,
): PokemonTcgApiPaginatedResponse<PokemonTcgApiSet> {
  const response = validatePokemonTcgPaginatedResponse<unknown>(
    value,
    requestedPage,
    SET_PAGE_SIZE,
    `Sets API page ${requestedPage}`,
  );
  return {
    ...response,
    data: response.data.map(validateSet),
  };
}

function apiErrorStatus(error: unknown): string {
  if (!axios.isAxiosError(error) || !error.response?.status) return "";
  return ` HTTP ${error.response.status}.`;
}

async function getApiPage<T>(
  url: string,
  page: number,
  pageSize: number,
  scope: string,
  additionalParams: Record<string, string> = {},
): Promise<RetriedPage<T>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await axios.get<unknown>(url, {
        params: {
          ...additionalParams,
          page,
          pageSize,
        },
        timeout: 30000,
        headers: process.env.POKEMON_TCG_API_KEY
          ? { "X-Api-Key": process.env.POKEMON_TCG_API_KEY }
          : {},
      });
      return {
        ...validatePokemonTcgPaginatedResponse<T>(
          response.data,
          page,
          pageSize,
          scope,
        ),
        retryCount: attempt - 1,
      };
    } catch (error) {
      lastError = error;
      console.warn(
        `${scope} failed.${apiErrorStatus(error)} Attempt ${attempt}/${MAX_RETRIES}`,
      );
      if (attempt === MAX_RETRIES) throw error;
      await sleep(5000 * attempt);
    }
  }

  throw lastError ?? new Error(`${scope} failed without an error`);
}

function quotedSetQuery(setId: string): string {
  if (!hasText(setId)) throw new Error("Cannot query an empty set ID");
  const escaped = setId.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `set.id:"${escaped}"`;
}

export async function getGlobalCardCount(): Promise<PokemonTcgApiCatalogCount> {
  const page = await getApiPage<{ id?: unknown }>(
    CARDS_API_URL,
    1,
    1,
    "Global card-count request",
    { select: "id" },
  );
  if (
    page.totalCount <= 0 ||
    page.count !== 1 ||
    !hasText(page.data[0]?.id)
  ) {
    throw new Error("Global card-count request returned an empty catalog");
  }
  return {
    retryCount: page.retryCount,
    totalCount: page.totalCount,
  };
}

export async function getSetsPage(
  page: number,
): Promise<PokemonTcgApiSetPage> {
  const response = await getApiPage<PokemonTcgApiSet>(
    SETS_API_URL,
    page,
    SET_PAGE_SIZE,
    `Sets API page ${page}`,
  );
  return {
    ...response,
    data: response.data.map(validateSet),
  };
}

export async function getCardsForSetPage(
  setId: string,
  page: number,
): Promise<PokemonTcgApiPage> {
  return getApiPage<PokemonTcgApiCard>(
    CARDS_API_URL,
    page,
    CARD_PAGE_SIZE,
    `Card API set ${setId} page ${page}`,
    { q: quotedSetQuery(setId) },
  );
}
