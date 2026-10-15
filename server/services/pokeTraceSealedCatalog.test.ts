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
import { loadPokeTraceSealedDetails } from "./pokeTraceSealedDetails.js";
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

test("sealed catalog and details anchor comparisons to each product's latest snapshot", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);
  const cases = [
    {
      latest: "2020-03-31",
      prices: [
        [0, 150],
        [-2, 140],
        [-8, 120],
        [-30, 100],
      ],
      expected: { "1d": 140, "7d": 120, "30d": 100 },
    },
    {
      latest: "2020-02-29",
      prices: [
        [0, 150],
        [-1, 145],
        [-2, 140],
        [-7, 125],
        [-8, 120],
        [-30, 100],
        [-31, 95],
      ],
      expected: { "1d": 145, "7d": 125, "30d": 100 },
    },
    {
      latest: "2020-01-31",
      prices: [
        [0, 150],
        [-6, 125],
        [-29, 100],
      ],
      expected: { "1d": 150, "7d": 125, "30d": 100 },
    },
    {
      latest: "2020-04-30",
      prices: [
        [0, 150],
        [-9, 120],
        [-32, 100],
      ],
      expected: { "1d": 150, "7d": null, "30d": null },
    },
    {
      latest: "2020-05-31",
      prices: [],
      expected: { "1d": null, "7d": null, "30d": null },
    },
  ];

  try {
    for (const [index, scenario] of cases.entries()) {
      const stored = { ...product, id: `${product.id.slice(0, -1)}${index}` };
      await database.execute(sealedProductUpsert(stored));
      for (const [offset, price] of scenario.prices) {
        const date = new Date(`${scenario.latest}T00:00:00.000Z`);
        date.setUTCDate(date.getUTCDate() + offset);
        await database.batch(
          sealedDailyPriceUpserts(
            {
              ...stored,
              prices: { tcgplayer: { UNOPENED: { avg: price } } },
            },
            date.toISOString().slice(0, 10),
          ),
          "write",
        );
      }
    }

    // These snapshots are years old: calendar-based lookups would lose them.
    const catalog = await generatePokeTraceSealedCatalog(database);
    for (const [index, scenario] of cases.entries()) {
      const id = `${product.id.slice(0, -1)}${index}`;
      const details = await loadPokeTraceSealedDetails(id, {
        database,
        ensureReady: async () => {},
      });
      assert.deepEqual(
        catalog.products.find((item) => item.id === id)?.priceSnapshots,
        scenario.expected,
      );
      assert.deepEqual(details?.priceSnapshots, scenario.expected);
    }
  } finally {
    database.close();
  }
});

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

    await database.batch(sealedDailyPriceUpserts(product, asOf), "write");

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
