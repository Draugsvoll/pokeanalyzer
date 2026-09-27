import assert from "node:assert/strict";
import test from "node:test";
import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogCard,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog.js";
import { POKETRACE_SEARCH_RESULT_LIMIT } from "../../shared/pokeTraceSearch.js";
import { loadPokeTraceSearch } from "./pokeTraceSearch.js";

function catalogCard({
  id,
  name,
  number,
  rarity,
  conditionPrices,
}: {
  id: string;
  name: string;
  number: number;
  rarity: string;
  conditionPrices: PokeTraceCatalogCard["conditionPrices"];
}): PokeTraceCatalogCard {
  return {
    id,
    name,
    number: String(number),
    setName: "Test Set",
    rarity,
    variant: "Normal",
    currency: "USD",
    conditionPrices,
    priceSnapshots: { "1d": null, "7d": null, "30d": null },
  };
}

function catalog(cards: PokeTraceCatalogCard[]): PokeTraceCatalogResponse {
  return {
    schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
    generatedAt: "2026-09-25T00:00:00.000Z",
    cards,
  };
}

test("server search returns at most the first 2,000 catalog matches", async () => {
  const cards = Array.from(
    { length: POKETRACE_SEARCH_RESULT_LIMIT + 1 },
    (_, index) => {
      const number = index + 1;
      return catalogCard({
        id: `card-${number}`,
        name: `Card ${number}`,
        number,
        rarity: "Rare",
        conditionPrices: { NEAR_MINT: number },
      });
    },
  );

  const response = await loadPokeTraceSearch(
    {
      cardId: "",
      cardNumber: "",
      pokemonName: "Card",
      rarity: "",
      setName: "",
    },
    {
      peekCatalog: () => catalog(cards),
      warmCatalog: () => undefined,
    },
  );

  assert.equal(response.total, POKETRACE_SEARCH_RESULT_LIMIT);
  assert.equal(response.items.length, POKETRACE_SEARCH_RESULT_LIMIT);
  assert.equal(response.items[0]?.id, "card-1");
  assert.equal(response.items.at(-1)?.id, "card-2000");
});

test("search applies the Near Mint price range and exact rarity", async () => {
  const cards = [
    catalogCard({
      id: "matching-common",
      name: "Matching Card",
      number: 1,
      rarity: "Common",
      conditionPrices: { LIGHTLY_PLAYED: 100, NEAR_MINT: 25 },
    }),
    catalogCard({
      id: "uncommon",
      name: "Uncommon Card",
      number: 2,
      rarity: "Uncommon",
      conditionPrices: { NEAR_MINT: 25 },
    }),
    catalogCard({
      id: "below-range",
      name: "Below Range",
      number: 3,
      rarity: "Common",
      conditionPrices: { NEAR_MINT: 10 },
    }),
    catalogCard({
      id: "lightly-played-only",
      name: "Lightly Played Only",
      number: 4,
      rarity: "Common",
      conditionPrices: { LIGHTLY_PLAYED: 25 },
    }),
  ];

  const response = await loadPokeTraceSearch(
    {
      cardId: "",
      cardNumber: "",
      maxPrice: 30,
      minPrice: 20,
      pokemonName: "",
      rarity: "Common",
      setName: "",
    },
    {
      peekCatalog: () => catalog(cards),
      warmCatalog: () => undefined,
    },
  );

  assert.equal(response.total, 1);
  assert.deepEqual(
    response.items.map((card) => card.id),
    ["matching-common"],
  );
});

test("search applies the selected condition to server catalog prices", async () => {
  const cards = [
    catalogCard({
      id: "lightly-played-match",
      name: "Matching Card",
      number: 1,
      rarity: "Common",
      conditionPrices: { LIGHTLY_PLAYED: 25, NEAR_MINT: 100 },
    }),
    catalogCard({
      id: "near-mint-only",
      name: "Near Mint Card",
      number: 2,
      rarity: "Common",
      conditionPrices: { NEAR_MINT: 25 },
    }),
  ];

  const response = await loadPokeTraceSearch(
    {
      cardId: "",
      cardNumber: "",
      condition: "LIGHTLY_PLAYED",
      maxPrice: 30,
      minPrice: 20,
      pokemonName: "",
      rarity: "",
      setName: "",
    },
    {
      peekCatalog: () => catalog(cards),
      warmCatalog: () => undefined,
    },
  );

  assert.deepEqual(
    response.items.map((card) => card.id),
    ["lightly-played-match"],
  );
});

test("search preserves all catalog snapshots for card views", async () => {
  const card = catalogCard({
    id: "card-with-history",
    name: "History Card",
    number: 1,
    rarity: "Rare",
    conditionPrices: { NEAR_MINT: 120 },
  });
  card.priceSnapshots = { "1d": 100, "7d": 90, "30d": null };

  const response = await loadPokeTraceSearch(
    {
      cardId: "",
      cardNumber: "",
      pokemonName: "History",
      rarity: "",
      setName: "",
    },
    {
      peekCatalog: () => catalog([card]),
      warmCatalog: () => undefined,
    },
  );

  assert.deepEqual(response.items[0]?.pokeTrace.marketPriceSnapshots, {
    "1d": 100,
    "7d": 90,
    "30d": null,
  });
});

test("server search leaves result sorting to the client", async () => {
  const down = catalogCard({
    id: "down",
    name: "Down",
    number: 1,
    rarity: "Rare",
    conditionPrices: { NEAR_MINT: 80 },
  });
  down.priceSnapshots["7d"] = 100;
  const up = catalogCard({
    id: "up",
    name: "Up",
    number: 2,
    rarity: "Rare",
    conditionPrices: { NEAR_MINT: 60 },
  });
  up.priceSnapshots["7d"] = 50;
  const missing = catalogCard({
    id: "missing",
    name: "Missing",
    number: 3,
    rarity: "Rare",
    conditionPrices: { NEAR_MINT: 90 },
  });

  const response = await loadPokeTraceSearch(
    {
      cardId: "",
      cardNumber: "",
      pokemonName: "",
      rarity: "Rare",
      setName: "",
    },
    {
      peekCatalog: () => catalog([down, missing, up]),
      warmCatalog: () => undefined,
    },
  );

  assert.deepEqual(
    response.items.map((card) => card.id),
    ["down", "missing", "up"],
  );
});

test("cold search uses Turso directly while warming the catalog", async () => {
  let warmed = 0;
  let directLoads = 0;
  const response = await loadPokeTraceSearch(
    {
      cardId: "",
      cardNumber: "",
      pokemonName: "Pikachu",
      rarity: "",
      setName: "",
    },
    {
      loadDirect: async () => {
        directLoads += 1;
        return { items: [], total: 0 };
      },
      peekCatalog: () => null,
      warmCatalog: () => {
        warmed += 1;
      },
    },
  );

  assert.deepEqual(response, { items: [], total: 0 });
  assert.equal(directLoads, 1);
  assert.equal(warmed, 1);
});
