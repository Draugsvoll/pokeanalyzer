import {
  isPokeTraceSealedCatalogProduct,
  isPokeTraceSealedDetails,
  isPokeTraceSealedMarketHistory,
  type PokeTraceSealedDetails,
  type PokeTraceSealedFilterOptions,
  type PokeTraceSealedMarketHistory,
  type PokeTraceSealedSearch,
  type PokeTraceSealedSearchResponse,
} from "../../shared/pokeTraceSealed";
import { runWithRequestTimeout } from "../utils/requestTimeout";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function requestJson(url: string, signal?: AbortSignal) {
  return runWithRequestTimeout(
    async (requestSignal) => {
      const response = await fetch(url, {
        cache: "no-store",
        signal: requestSignal,
      });
      if (!response.ok) {
        const value: unknown = await response.json().catch(() => null);
        const message =
          isRecord(value) && typeof value.error === "string"
            ? value.error
            : `Sealed product request failed: ${response.status}`;
        throw new Error(message);
      }
      return response.json() as Promise<unknown>;
    },
    { signal },
  );
}

export async function searchSealedProducts(
  search: PokeTraceSealedSearch,
  signal?: AbortSignal,
): Promise<PokeTraceSealedSearchResponse> {
  const params = new URLSearchParams();
  if (search.name.trim()) params.set("name", search.name.trim());
  if (search.setName.trim()) params.set("setName", search.setName.trim());
  if (search.productFamily.trim()) {
    params.set("productFamily", search.productFamily.trim());
  }
  if (search.minPrice !== undefined) {
    params.set("minPrice", String(search.minPrice));
  }
  if (search.maxPrice !== undefined) {
    params.set("maxPrice", String(search.maxPrice));
  }

  const value = await requestJson(
    `${API_URL}/api/sealed/search?${params}`,
    signal,
  );
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isPokeTraceSealedCatalogProduct) ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0
  ) {
    throw new Error("Invalid sealed search response");
  }
  return value as unknown as PokeTraceSealedSearchResponse;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (option) => typeof option === "string" && option.trim().length > 0,
    )
  );
}

export async function fetchSealedFilterOptions(
  signal?: AbortSignal,
): Promise<PokeTraceSealedFilterOptions> {
  const value = await requestJson(
    `${API_URL}/api/sealed/filter-options`,
    signal,
  );
  if (
    !isRecord(value) ||
    !isStringArray(value.setNames) ||
    !isStringArray(value.productFamilies)
  ) {
    throw new Error("Invalid sealed filter-options response");
  }
  return value as PokeTraceSealedFilterOptions;
}

export async function fetchSealedProduct(
  id: string,
  signal?: AbortSignal,
): Promise<PokeTraceSealedDetails> {
  const value = await requestJson(
    `${API_URL}/api/sealed/${encodeURIComponent(id)}`,
    signal,
  );
  if (!isPokeTraceSealedDetails(value) || value.id !== id) {
    throw new Error("Invalid sealed product response");
  }
  return value;
}

export async function fetchSealedMarketPriceHistory(
  id: string,
  signal?: AbortSignal,
): Promise<PokeTraceSealedMarketHistory> {
  const value = await requestJson(
    `${API_URL}/api/sealed/${encodeURIComponent(id)}/market-price-history`,
    signal,
  );
  if (!isPokeTraceSealedMarketHistory(value) || value.productId !== id) {
    throw new Error("Invalid sealed price-history response");
  }
  return value;
}
