import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migratePokeTraceDatabase } from "../db/pokeTraceDb.js";
import type { PokeTraceSealedProduct as ApiSealedProduct } from "./pokeTraceApi.js";
import {
  createPokeTraceSealedFilterOptions,
  createPokeTraceSealedCatalogCache,
  generatePokeTraceSealedCatalog,
  loadPersistedPokeTraceSealedCatalog,
} from "./pokeTraceSealedCatalog.js";
import { savePokeTraceSealedCatalog } from "./pokeTraceSealedCatalogStore.js";
import {
  sealedDailyPriceUpserts,
  sealedProductUpsert,
} from "./pokeTraceSealedStore.js";

const product: ApiSealedProduct = {
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
  prices: { tcgplayer: { UNOPENED: { avg: 150 } } },
};

test("sealed catalog generation uses only sealed storage", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);
  const asOf = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(`${asOf}T00:00:00.000Z`);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  try {
    await database.execute(sealedProductUpsert(product));
    await database.batch(
      sealedDailyPriceUpserts(
        {
          ...product,
          prices: { tcgplayer: { UNOPENED: { avg: 125 } } },
        },
        sevenDaysAgo.toISOString().slice(0, 10),
      ),
      "write",
    );

    const catalog = await generatePokeTraceSealedCatalog(database);
    assert.equal(catalog.products.length, 1);
    assert.equal(catalog.products[0]?.price, 150);
    assert.equal(catalog.products[0]?.priceSnapshots["7d"], 125);

    const singles = await database.execute(
      "SELECT COUNT(*) AS count FROM poketrace_cards",
    );
    assert.equal(Number(singles.rows[0]?.count), 0);
  } finally {
    database.close();
  }
});

test("sealed catalog loading uses only the last published payload", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);
  const published = {
    schemaVersion: 1 as const,
    generatedAt: "2026-10-05T00:00:00.000Z",
    products: [
      {
        id: "published-product",
        name: "Published Product",
        setName: "Published Set",
        productFamily: "booster_box",
        currency: "USD",
        price: 100,
        priceSnapshots: { "1d": 99, "7d": 95, "30d": 90 },
      },
    ],
  };

  try {
    await database.execute(sealedProductUpsert(product));
    await savePokeTraceSealedCatalog(database, published);

    const loaded = await loadPersistedPokeTraceSealedCatalog({
      database,
      ensureReady: async () => {},
    });

    assert.deepEqual(loaded, published);
    assert.notEqual(loaded.products[0]?.id, product.id);
  } finally {
    database.close();
  }
});

test("sealed server catalog cache shares loads and serves stale data on failure", async () => {
  let now = 1_000;
  let calls = 0;
  let shouldFail = false;
  const catalog = {
    schemaVersion: 1 as const,
    generatedAt: "2026-10-05T00:00:00.000Z",
    products: [],
  };
  const cache = createPokeTraceSealedCatalogCache(
    async () => {
      calls += 1;
      if (shouldFail) throw new Error("temporary failure");
      return catalog;
    },
    100,
    () => now,
  );

  const [first, second] = await Promise.all([cache.get(), cache.get()]);
  assert.equal(first, catalog);
  assert.equal(second, catalog);
  assert.equal(calls, 1);

  now += 101;
  shouldFail = true;
  assert.equal(await cache.get(), catalog);
  assert.equal(calls, 2);
});

test("sealed server catalog cache force-refreshes fresh data", async () => {
  let calls = 0;
  let shouldFail = false;
  const catalogs = [
    {
      schemaVersion: 1 as const,
      generatedAt: "2026-10-05T00:00:00.000Z",
      products: [],
    },
    {
      schemaVersion: 1 as const,
      generatedAt: "2026-10-06T00:00:00.000Z",
      products: [],
    },
  ];
  const cache = createPokeTraceSealedCatalogCache(async () => {
    calls += 1;
    if (shouldFail) throw new Error("temporary failure");
    return catalogs[Math.min(calls - 1, catalogs.length - 1)];
  });

  assert.equal(await cache.get(), catalogs[0]);
  assert.equal(await cache.refresh(), catalogs[1]);
  assert.equal(cache.peek(), catalogs[1]);
  assert.equal(calls, 2);

  shouldFail = true;
  await assert.rejects(cache.refresh(), /temporary failure/);
  assert.equal(cache.peek(), catalogs[1]);
});

test("sealed filter options are unique and sorted", () => {
  const catalogProduct = {
    id: "product-1",
    name: "Product",
    setName: "XY Base Set",
    productFamily: "booster_box",
    currency: "USD",
    price: null,
    priceSnapshots: { "1d": null, "7d": null, "30d": null },
  };
  const options = createPokeTraceSealedFilterOptions([
    catalogProduct,
    { ...catalogProduct, id: "product-2", setName: "Base Set" },
    { ...catalogProduct, id: "product-3", productFamily: "deck" },
    { ...catalogProduct, id: "product-4", setName: "Unknown set" },
  ]);

  assert.deepEqual(options, {
    productFamilies: ["booster_box", "deck"],
    setNames: ["Base Set", "XY Base Set"],
  });
});
