import type { Client } from "@libsql/client";
import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogCard,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog.js";
import { parsePokeTraceMarketComparisons } from "../../shared/pokeTraceMarketComparisons.js";
import type { PokeTraceRawCondition } from "../../shared/pokeTraceMarketConditions.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { loadStoredPokeTraceCatalog } from "./pokeTraceCatalogStore.js";
import { logError } from "../security/logging.js";

type CatalogDatabase = Pick<Client, "execute">;
type CatalogRow = Record<string, unknown>;
export const POKETRACE_CATALOG_SERVER_CACHE_MS = 12 * 60 * 60 * 1000;
const POKETRACE_CATALOG_STALE_RETRY_MS = 5 * 60 * 1000;

type CatalogLoader = () => Promise<PokeTraceCatalogResponse>;

export type PokeTraceCatalogCache =
  (() => Promise<PokeTraceCatalogResponse>) & {
    canWarm: () => boolean;
    peek: () => PokeTraceCatalogResponse | null;
    refresh: () => Promise<PokeTraceCatalogResponse>;
  };

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const CONDITION_PRICE_COLUMNS = [
  ["NEAR_MINT", "near_mint_price"],
  ["LIGHTLY_PLAYED", "lightly_played_price"],
  ["MODERATELY_PLAYED", "moderately_played_price"],
  ["HEAVILY_PLAYED", "heavily_played_price"],
  ["DAMAGED", "damaged_price"],
] as const satisfies readonly [PokeTraceRawCondition, string][];

function conditionPrices(row: CatalogRow) {
  const prices: PokeTraceCatalogCard["conditionPrices"] = {};
  for (const [condition, column] of CONDITION_PRICE_COLUMNS) {
    const price = positiveNumber(row[column]);
    if (price !== null) prices[condition] = price;
  }
  return prices;
}

export function toPokeTraceCatalogCard(row: CatalogRow): PokeTraceCatalogCard {
  const comparisons = parsePokeTraceMarketComparisons(
    row.tcg_market_comparisons,
  );

  return {
    id: String(row.id),
    name: String(row.name),
    ...(optionalText(row.card_number) && {
      number: optionalText(row.card_number),
    }),
    setName: optionalText(row.set_name) ?? "Unknown set",
    ...(optionalText(row.rarity) && { rarity: optionalText(row.rarity) }),
    ...(optionalText(row.variant) && { variant: optionalText(row.variant) }),
    ...(optionalText(row.image_url) && { image: optionalText(row.image_url) }),
    currency: optionalText(row.currency) ?? "USD",
    conditionPrices: conditionPrices(row),
    priceSnapshots: {
      "1d": comparisons?.comparisons["1d"]?.marketPrice ?? null,
      "7d": comparisons?.comparisons["7d"]?.marketPrice ?? null,
      "30d": comparisons?.comparisons["30d"]?.marketPrice ?? null,
    },
  };
}

export async function generatePokeTraceCatalog(
  database: CatalogDatabase,
): Promise<PokeTraceCatalogResponse> {
  const result = await database.execute(`
    SELECT
      id,
      name,
      card_number,
      set_name,
      rarity,
      variant,
      image_url,
      json_extract(raw_json, '$.currency') AS currency,
      json_extract(raw_json, '$.prices.tcgplayer.NEAR_MINT.avg') AS near_mint_price,
      json_extract(raw_json, '$.prices.tcgplayer.LIGHTLY_PLAYED.avg') AS lightly_played_price,
      json_extract(raw_json, '$.prices.tcgplayer.MODERATELY_PLAYED.avg') AS moderately_played_price,
      json_extract(raw_json, '$.prices.tcgplayer.HEAVILY_PLAYED.avg') AS heavily_played_price,
      json_extract(raw_json, '$.prices.tcgplayer.DAMAGED.avg') AS damaged_price,
      tcg_market_comparisons
    FROM poketrace_cards
    ORDER BY name, set_name, card_number, variant, id
  `);

  return {
    schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    cards: result.rows.map((row) =>
      toPokeTraceCatalogCard(row as unknown as CatalogRow),
    ),
  };
}

export function createPokeTraceCatalogCache(
  loadCatalog: CatalogLoader,
  maxAgeMs = POKETRACE_CATALOG_SERVER_CACHE_MS,
  now: () => number = Date.now,
): PokeTraceCatalogCache {
  let cached:
    { catalog: PokeTraceCatalogResponse; expiresAt: number } | undefined;
  let loadPromise: Promise<PokeTraceCatalogResponse> | undefined;
  let coldRetryAt = 0;
  let coldLoadError: unknown;

  const startLoad = () => {
    if (loadPromise) return loadPromise;

    const load = Promise.resolve()
      .then(loadCatalog)
      .then((catalog) => {
        cached = { catalog, expiresAt: now() + maxAgeMs };
        coldRetryAt = 0;
        coldLoadError = undefined;
        return catalog;
      })
      .catch((error: unknown) => {
        if (!cached) {
          coldLoadError = error;
          coldRetryAt =
            now() + Math.min(maxAgeMs, POKETRACE_CATALOG_STALE_RETRY_MS);
        }
        throw error;
      });
    loadPromise = load;

    void load.then(
      () => {
        if (loadPromise === load) loadPromise = undefined;
      },
      () => {
        if (loadPromise === load) loadPromise = undefined;
      },
    );
    return load;
  };

  const forceRefresh = async () => {
    const pendingLoad = loadPromise;
    if (pendingLoad) {
      try {
        await pendingLoad;
      } catch {
        // The forced refresh below is an independent retry.
      }
    }
    return startLoad();
  };

  const getCatalog = async () => {
    const currentTime = now();
    if (cached && cached.expiresAt > currentTime) return cached.catalog;
    if (!cached && coldRetryAt > currentTime) throw coldLoadError;

    try {
      return await startLoad();
    } catch (error) {
      if (!cached) throw error;
      cached = {
        catalog: cached.catalog,
        expiresAt: now() + Math.min(maxAgeMs, POKETRACE_CATALOG_STALE_RETRY_MS),
      };
      return cached.catalog;
    }
  };
  getCatalog.canWarm = () => {
    if (loadPromise) return false;
    const currentTime = now();
    if (cached) return cached.expiresAt <= currentTime;
    return coldRetryAt <= currentTime;
  };
  getCatalog.peek = () => cached?.catalog ?? null;
  getCatalog.refresh = forceRefresh;
  return getCatalog;
}

async function loadPersistedCatalog() {
  await ensurePokeTraceReady();
  const catalog = await loadStoredPokeTraceCatalog(pokeTraceDb);
  if (!catalog) {
    throw new Error(
      "PokeTrace catalog has not been generated by the daily refresh yet",
    );
  }
  return catalog;
}

export const getCachedPokeTraceCatalog =
  createPokeTraceCatalogCache(loadPersistedCatalog);

export function peekCachedPokeTraceCatalog() {
  return getCachedPokeTraceCatalog.peek();
}

export function refreshPokeTraceCatalog() {
  return getCachedPokeTraceCatalog.refresh();
}

export function warmPokeTraceCatalogInBackground() {
  if (!getCachedPokeTraceCatalog.canWarm()) return;
  void getCachedPokeTraceCatalog().catch((error: unknown) => {
    logError("Failed to warm PokeTrace catalog cache", error);
  });
}
