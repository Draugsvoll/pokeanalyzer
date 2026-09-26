import assert from "node:assert/strict";
import test from "node:test";
import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog.js";
import {
  createPokeTraceCatalogCache,
  toPokeTraceCatalogCard,
} from "./pokeTraceCatalog.js";

function catalog(generatedAt: string): PokeTraceCatalogResponse {
  return {
    schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
    generatedAt,
    cards: [
      {
        id: "card-1",
        name: "Charizard",
        setName: "Base Set",
        currency: "USD",
        conditionPrices: { NEAR_MINT: 420 },
        priceSnapshots: { "1d": 410, "7d": 400, "30d": 390 },
      },
    ],
  };
}

test("builds a compact browser card from PokeTrace data", () => {
  const card = toPokeTraceCatalogCard({
    id: "card-1",
    name: "Charizard",
    card_number: "004/102",
    set_name: "Base Set",
    rarity: "Holo Rare",
    variant: "Unlimited Holofoil",
    image_url: "https://example.test/charizard.webp",
    currency: "USD",
    near_mint_price: 420,
    lightly_played_price: 380,
    moderately_played_price: 340,
    heavily_played_price: null,
    damaged_price: 250,
    tcg_market_comparisons: JSON.stringify({
      asOf: "2026-09-18",
      comparisons: {
        "1d": {
          targetDate: "2026-09-17",
          recordedAt: "2026-09-17",
          marketPrice: 410,
          sourceUpdatedAt: null,
        },
        "7d": null,
        "30d": {
          targetDate: "2026-08-19",
          recordedAt: "2026-08-18",
          marketPrice: 390,
          sourceUpdatedAt: null,
        },
      },
    }),
  });

  assert.deepEqual(card, {
    id: "card-1",
    name: "Charizard",
    number: "004/102",
    setName: "Base Set",
    rarity: "Holo Rare",
    variant: "Unlimited Holofoil",
    image: "https://example.test/charizard.webp",
    currency: "USD",
    conditionPrices: {
      NEAR_MINT: 420,
      LIGHTLY_PLAYED: 380,
      MODERATELY_PLAYED: 340,
      DAMAGED: 250,
    },
    priceSnapshots: { "1d": 410, "7d": null, "30d": 390 },
  });
});

test("server catalog cache shares concurrent loads and expires once", async () => {
  let now = 1_000;
  let loads = 0;
  const getCatalog = createPokeTraceCatalogCache(
    async () => {
      loads += 1;
      return catalog(`2026-09-25T00:00:0${loads}.000Z`);
    },
    100,
    () => now,
  );

  const [first, concurrent] = await Promise.all([getCatalog(), getCatalog()]);
  assert.equal(loads, 1);
  assert.equal(first.generatedAt, concurrent.generatedAt);

  now = 1_099;
  assert.equal((await getCatalog()).generatedAt, first.generatedAt);
  assert.equal(loads, 1);

  now = 1_100;
  assert.notEqual((await getCatalog()).generatedAt, first.generatedAt);
  assert.equal(loads, 2);
});

test("server catalog cache retries after a failed load", async () => {
  let loads = 0;
  const getCatalog = createPokeTraceCatalogCache(async () => {
    loads += 1;
    if (loads === 1) throw new Error("temporary failure");
    return catalog("2026-09-25T00:00:00.000Z");
  });

  await assert.rejects(getCatalog(), /temporary failure/);
  assert.equal((await getCatalog()).cards.length, 1);
  assert.equal(loads, 2);
});

test("server catalog cache serves stale data after a refresh failure", async () => {
  let now = 1_000;
  let loads = 0;
  let refreshFails = false;
  const getCatalog = createPokeTraceCatalogCache(
    async () => {
      loads += 1;
      if (refreshFails) throw new Error("temporary Turso failure");
      return catalog(`2026-09-25T00:00:0${loads}.000Z`);
    },
    100,
    () => now,
  );

  const initial = await getCatalog();
  refreshFails = true;
  now = 1_100;
  assert.equal((await getCatalog()).generatedAt, initial.generatedAt);
  assert.equal(loads, 2);

  now = 1_199;
  assert.equal((await getCatalog()).generatedAt, initial.generatedAt);
  assert.equal(loads, 2);

  refreshFails = false;
  now = 1_200;
  assert.notEqual((await getCatalog()).generatedAt, initial.generatedAt);
  assert.equal(loads, 3);
});
