import type { Client } from "@libsql/client";
import {
  POKETRACE_SEALED_CATALOG_SCHEMA_VERSION,
  type PokeTraceSealedCatalogResponse,
  type PokeTraceSealedFilterOptions,
  type PokeTraceSealedCatalogProduct,
} from "../../shared/pokeTraceSealed.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { logError } from "../security/logging.js";
import { loadStoredPokeTraceSealedCatalog } from "./pokeTraceSealedCatalogStore.js";

type SealedCatalogDatabase = Pick<Client, "execute">;
type CatalogLoader = () => Promise<PokeTraceSealedCatalogResponse>;

const SERVER_CACHE_MS = 12 * 60 * 60 * 1_000;
const STALE_RETRY_MS = 5 * 60 * 1_000;

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function dateOffset(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function comparisonPrice(
  snapshots: Map<string, number>,
  asOf: string,
  days: number,
) {
  const target = dateOffset(asOf, -days);
  return (
    snapshots.get(target) ??
    snapshots.get(dateOffset(target, -1)) ??
    snapshots.get(dateOffset(target, 1)) ??
    null
  );
}

export async function generatePokeTraceSealedCatalog(
  database: SealedCatalogDatabase,
): Promise<PokeTraceSealedCatalogResponse> {
  const generatedAt = new Date().toISOString();
  const asOf = generatedAt.slice(0, 10);
  const [productsResult, snapshotsResult] = await Promise.all([
    database.execute(`
      SELECT
        id,
        name,
        set_name,
        product_family,
        variant,
        image_url,
        fetched_at,
        json_extract(raw_json, '$.currency') AS currency,
        json_extract(raw_json, '$.prices.tcgplayer.UNOPENED.avg') AS price,
        json_extract(raw_json, '$.lastUpdated') AS last_updated
      FROM poketrace_sealed_products
      ORDER BY name, set_name, product_family, variant, id
    `),
    database.execute({
      sql: `
        SELECT product_id, recorded_at, market_price
        FROM poketrace_sealed_tcg_market_prices
        WHERE recorded_at >= date(?, '-31 days')
          AND recorded_at <= ?
        ORDER BY product_id, recorded_at
      `,
      args: [asOf, asOf],
    }),
  ]);

  const snapshotsByProduct = new Map<string, Map<string, number>>();
  for (const row of snapshotsResult.rows) {
    const productId = String(row.product_id);
    let snapshots = snapshotsByProduct.get(productId);
    if (!snapshots) {
      snapshots = new Map();
      snapshotsByProduct.set(productId, snapshots);
    }
    snapshots.set(String(row.recorded_at), Number(row.market_price));
  }

  const products: PokeTraceSealedCatalogProduct[] = productsResult.rows.map(
    (row) => {
      const snapshots = snapshotsByProduct.get(String(row.id)) ?? new Map();
      return {
        id: String(row.id),
        name: String(row.name),
        setName: optionalText(row.set_name) ?? "Unknown set",
        productFamily: String(row.product_family),
        ...(optionalText(row.variant) && {
          variant: optionalText(row.variant),
        }),
        ...(optionalText(row.image_url) && {
          image: optionalText(row.image_url),
        }),
        currency: optionalText(row.currency) ?? "USD",
        price: positiveNumber(row.price),
        priceSnapshots: {
          "1d": comparisonPrice(snapshots, asOf, 1),
          "7d": comparisonPrice(snapshots, asOf, 7),
          "30d": comparisonPrice(snapshots, asOf, 30),
        },
        ...(optionalText(row.last_updated) && {
          lastUpdated: optionalText(row.last_updated),
        }),
      };
    },
  );

  return {
    schemaVersion: POKETRACE_SEALED_CATALOG_SCHEMA_VERSION,
    generatedAt,
    products,
  };
}

export function createPokeTraceSealedCatalogCache(
  loadCatalog: CatalogLoader,
  maxAgeMs = SERVER_CACHE_MS,
  now: () => number = Date.now,
) {
  let cached:
    { catalog: PokeTraceSealedCatalogResponse; expiresAt: number } | undefined;
  let loadPromise: Promise<PokeTraceSealedCatalogResponse> | undefined;

  const startLoad = () => {
    if (loadPromise) return loadPromise;
    const load = Promise.resolve()
      .then(loadCatalog)
      .then((catalog) => {
        cached = { catalog, expiresAt: now() + maxAgeMs };
        return catalog;
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

  const getCatalog = async () => {
    if (cached && cached.expiresAt > now()) return cached.catalog;
    try {
      return await startLoad();
    } catch (error) {
      if (!cached) throw error;
      cached.expiresAt = now() + Math.min(maxAgeMs, STALE_RETRY_MS);
      return cached.catalog;
    }
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

  return {
    get: getCatalog,
    peek: () => cached?.catalog ?? null,
    refresh: forceRefresh,
    warm: () => {
      if (loadPromise || (cached && cached.expiresAt > now())) return;
      void startLoad().catch((error: unknown) => {
        logError("Failed to warm sealed catalog cache", error);
      });
    },
  };
}

function uniqueSorted(values: string[]) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    unique.set(trimmed.toLocaleLowerCase("en-US"), trimmed);
  }
  return [...unique.values()].sort((left, right) =>
    left.localeCompare(right, "en-US", { sensitivity: "base" }),
  );
}

export function createPokeTraceSealedFilterOptions(
  products: readonly PokeTraceSealedCatalogProduct[],
): PokeTraceSealedFilterOptions {
  return {
    productFamilies: uniqueSorted(
      products.map(({ productFamily }) => productFamily),
    ),
    setNames: uniqueSorted(
      products
        .map(({ setName }) => setName)
        .filter((setName) => setName !== "Unknown set"),
    ),
  };
}

export async function loadPersistedPokeTraceSealedCatalog(
  dependencies: Partial<{
    database: SealedCatalogDatabase;
    ensureReady: () => Promise<void>;
  }> = {},
) {
  const database = dependencies.database ?? pokeTraceDb;
  await (dependencies.ensureReady ?? ensurePokeTraceReady)();
  const catalog = await loadStoredPokeTraceSealedCatalog(database);
  if (!catalog) {
    throw new Error(
      "PokeTrace sealed catalog has not been generated by a complete import or daily refresh yet",
    );
  }
  return catalog;
}

const sealedCatalogCache = createPokeTraceSealedCatalogCache(
  loadPersistedPokeTraceSealedCatalog,
);

export const getCachedPokeTraceSealedCatalog = sealedCatalogCache.get;
export const peekCachedPokeTraceSealedCatalog = sealedCatalogCache.peek;
export const refreshPokeTraceSealedCatalog = sealedCatalogCache.refresh;
export const warmPokeTraceSealedCatalogInBackground = sealedCatalogCache.warm;
