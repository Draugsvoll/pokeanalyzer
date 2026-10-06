import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migratePokeTraceDatabase } from "../db/pokeTraceDb.js";
import type { PokeTraceSealedProduct } from "../services/pokeTraceApi.js";
import {
  loadStoredPokeTraceSealedCatalog,
  savePokeTraceSealedCatalog,
} from "../services/pokeTraceSealedCatalogStore.js";
import {
  sealedDailyPriceUpserts,
  sealedProductUpsert,
} from "../services/pokeTraceSealedStore.js";
import {
  refreshPokeTraceSealedProducts,
  type PokeTraceSealedRefreshCheckpoint,
} from "./pokeTraceSealedRefreshJob.js";

const product: PokeTraceSealedProduct = {
  id: "019bff85-5452-714a-9660-a3559a2d5d95",
  name: "XY Booster Box",
  set: { name: "XY Base Set" },
  variant: "Normal",
  image: "https://cdn.poketrace.com/cards/box.webp",
  refs: { tcgplayerId: "123" },
  game: "pokemon",
  market: "US",
  productType: "sealed",
  productFamily: "booster_box",
  currency: "USD",
  lastUpdated: "2026-10-05T08:00:00.000Z",
  prices: { tcgplayer: { UNOPENED: { avg: 150 } } },
};

test("sealed daily refresh saves products and snapshots without touching singles", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);

  try {
    const result = await refreshPokeTraceSealedProducts(
      "test-key",
      "2026-10-05",
      () => {},
      {
        database,
        fetchPage: async () => ({
          data: [product],
          pagination: { hasMore: false, nextCursor: null },
        }),
        log: () => {},
        requestGapMs: 0,
      },
    );

    assert.deepEqual(result, {
      pages: 1,
      products: 1,
      removedProducts: 0,
      snapshots: 1,
    });
    const sealed = await database.execute(
      "SELECT COUNT(*) AS count FROM poketrace_sealed_products",
    );
    const snapshots = await database.execute(
      "SELECT product_id, recorded_at, market_price FROM poketrace_sealed_tcg_market_prices",
    );
    const singles = await database.execute(
      "SELECT COUNT(*) AS count FROM poketrace_cards",
    );
    assert.equal(Number(sealed.rows[0]?.count), 1);
    assert.deepEqual(
      { ...snapshots.rows[0] },
      {
        product_id: product.id,
        recorded_at: "2026-10-05",
        market_price: 150,
      },
    );
    assert.equal(Number(singles.rows[0]?.count), 0);
    const catalog = await loadStoredPokeTraceSealedCatalog(database);
    assert.equal(catalog?.products.length, 1);
    assert.equal(catalog?.products[0]?.id, product.id);
  } finally {
    database.close();
  }
});

test("a complete sealed sweep removes products absent from the crawl", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);
  const obsoleteProduct = {
    ...product,
    id: "019bff85-5452-714a-9660-a3559a2d5d96",
    name: "Obsolete Box",
  };
  await database.batch(
    [
      sealedProductUpsert(obsoleteProduct),
      ...sealedDailyPriceUpserts(obsoleteProduct, "2026-10-04"),
    ],
    "write",
  );

  try {
    const result = await refreshPokeTraceSealedProducts(
      "test-key",
      "2026-10-05",
      () => {},
      {
        createCrawlId: () => "complete-crawl",
        database,
        fetchPage: async () => ({
          data: [product],
          pagination: { hasMore: false, nextCursor: null },
        }),
        log: () => {},
        requestGapMs: 0,
      },
    );

    assert.equal(result.removedProducts, 1);
    const products = await database.execute(
      "SELECT id FROM poketrace_sealed_products ORDER BY id",
    );
    assert.deepEqual(
      products.rows.map((row) => row.id),
      [product.id],
    );
    const obsoleteSnapshots = await database.execute({
      sql: `
        SELECT COUNT(*) AS count
        FROM poketrace_sealed_tcg_market_prices
        WHERE product_id = ?
      `,
      args: [obsoleteProduct.id],
    });
    assert.equal(Number(obsoleteSnapshots.rows[0]?.count), 0);
  } finally {
    database.close();
  }
});

test("a failed sealed sweep preserves the last published catalog", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);
  const publishedCatalog = {
    schemaVersion: 1 as const,
    generatedAt: "2026-10-04T00:00:00.000Z",
    products: [
      {
        id: "previous-product",
        name: "Previous Product",
        setName: "Previous Set",
        productFamily: "booster_box",
        currency: "USD",
        price: 100,
        priceSnapshots: { "1d": 99, "7d": 95, "30d": 90 },
      },
    ],
  };
  await savePokeTraceSealedCatalog(database, publishedCatalog);
  const previousProduct = { ...product, id: "previous-product" };
  await database.execute(sealedProductUpsert(previousProduct));
  let pages = 0;
  const checkpoints: PokeTraceSealedRefreshCheckpoint[] = [];

  try {
    await assert.rejects(
      refreshPokeTraceSealedProducts("test-key", "2026-10-05", () => {}, {
        database,
        fetchPage: async () => {
          pages += 1;
          if (pages === 1) {
            return {
              data: [product],
              pagination: { hasMore: true, nextCursor: "next-page" },
            };
          }
          throw new Error("second page failed");
        },
        log: () => {},
        requestGapMs: 0,
        createCrawlId: () => "failed-crawl",
        onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
      }),
      /second page failed/,
    );

    assert.deepEqual(checkpoints.at(-1), {
      complete: false,
      nextCursor: "next-page",
      pages: 1,
      products: 1,
      snapshots: 1,
    });

    const updatedProducts = await database.execute(
      "SELECT id FROM poketrace_sealed_products",
    );
    assert.deepEqual(
      updatedProducts.rows.map((row) => row.id).sort(),
      [previousProduct.id, product.id].sort(),
    );
    assert.deepEqual(
      await loadStoredPokeTraceSealedCatalog(database),
      publishedCatalog,
    );
  } finally {
    database.close();
  }
});
