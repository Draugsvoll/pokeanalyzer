import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migratePokeTraceDatabase } from "../db/pokeTraceDb.js";
import type { PokeTraceSealedProduct } from "./pokeTraceApi.js";
import { loadPokeTraceSealedDetails } from "./pokeTraceSealedDetails.js";
import { sealedProductUpsert } from "./pokeTraceSealedStore.js";

const storedProduct: PokeTraceSealedProduct = {
  id: "019bff93-f25a-71cc-92f5-cc4cb853358a",
  name: "2019 World Championship Deck",
  set: { name: "World Championship Decks", slug: "world-championship-decks" },
  variant: "Normal",
  image: "https://cdn.poketrace.com/cards/deck.webp",
  game: "pokemon",
  market: "US",
  productType: "sealed",
  productFamily: "deck",
  currency: "USD",
  lastUpdated: "2026-10-05T00:00:00.000Z",
  refs: { tcgplayerId: "200138", cardmarketId: "456" },
  marketplaceUrls: {
    tcgplayer: "https://www.tcgplayer.com/product/200138",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=world+championship+deck",
  },
  prices: {
    tcgplayer: {
      UNOPENED: {
        avg: 99.97,
        low: 90,
        high: 110,
        avg1d: 98,
        avg7d: 95,
        avg30d: 92,
        median3d: 97,
        median7d: 96,
        median30d: 93,
        saleCount: 12,
        approxSaleCount: false,
        lastUpdated: "2026-10-05T00:00:00.000Z",
      },
    },
    ebay: {
      UNOPENED: {
        avg: 104.5,
        low: 96,
        high: 118,
        avg1d: 103,
        avg7d: 101,
        avg30d: 99,
        median3d: 102,
        median7d: 100,
        median30d: 98,
        saleCount: 8,
        approxSaleCount: true,
        lastUpdated: "2026-10-05T00:00:00.000Z",
      },
    },
  },
};

test("sealed details map complete UI data from stored raw JSON and snapshots", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);
  await database.execute(sealedProductUpsert(storedProduct));
  for (const [recordedAt, marketPrice] of [
    ["2026-10-05", 98],
    ["2026-09-29", 95],
    ["2026-09-06", 92],
  ] as const) {
    await database.execute({
      sql: `
        INSERT INTO poketrace_sealed_tcg_market_prices
          (product_id, recorded_at, market_price)
        VALUES (?, ?, ?)
      `,
      args: [storedProduct.id, recordedAt, marketPrice],
    });
  }

  try {
    const details = await loadPokeTraceSealedDetails(storedProduct.id, {
      database,
      ensureReady: async () => {},
      now: () => new Date("2026-10-06T12:00:00.000Z"),
    });

    assert.ok(details);
    assert.equal(details.name, storedProduct.name);
    assert.equal(details.setName, "World Championship Decks");
    assert.equal(details.setSlug, "world-championship-decks");
    assert.equal(details.productFamily, "deck");
    assert.equal(details.variant, "Normal");
    assert.equal(details.image, storedProduct.image);
    assert.equal(details.price, 99.97);
    assert.deepEqual(details.priceSnapshots, {
      "1d": 98,
      "7d": 95,
      "30d": 92,
    });
    assert.equal(details.pricing.tcgplayer?.average7d, 95);
    assert.equal(details.pricing.tcgplayer?.low, 90);
    assert.equal(details.pricing.tcgplayer?.high, 110);
    assert.equal(details.pricing.tcgplayer?.saleCount, 12);
    assert.equal(details.pricing.ebay?.price, 104.5);
    assert.equal(details.pricing.ebay?.average7d, 101);
    assert.equal(details.pricing.ebay?.saleCount, 8);
    assert.equal(details.pricing.ebay?.approxSaleCount, true);
    assert.equal(details.refs.tcgplayerId, "200138");
    assert.equal(details.refs.cardmarketId, "456");
    assert.equal(
      details.marketplaceUrls.tcgplayer,
      "https://www.tcgplayer.com/product/200138",
    );
  } finally {
    database.close();
  }
});

test("sealed details return null when the product is not stored", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);

  try {
    assert.equal(
      await loadPokeTraceSealedDetails(storedProduct.id, {
        database,
        ensureReady: async () => {},
      }),
      null,
    );
  } finally {
    database.close();
  }
});
