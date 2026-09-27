import assert from "node:assert/strict";
import test from "node:test";
import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogCard,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog.js";
import { POKETRACE_SEARCH_RESULT_LIMIT } from "../../shared/pokeTraceSearch.js";
import { loadPokeTraceSet } from "./pokeTraceSet.js";

function card(id: string, setName: string): PokeTraceCatalogCard {
  return {
    id,
    name: id,
    setName,
    currency: "USD",
    conditionPrices: { NEAR_MINT: 10 },
    priceSnapshots: { "1d": null, "7d": null, "30d": null },
  };
}

function catalog(cards: PokeTraceCatalogCard[]): PokeTraceCatalogResponse {
  return {
    schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
    generatedAt: "2026-09-27T00:00:00.000Z",
    cards,
  };
}

test("loads an exact set up to the standard result limit", async () => {
  const matchingCards = Array.from(
    { length: POKETRACE_SEARCH_RESULT_LIMIT + 1 },
    (_, index) => card(`matching-${index}`, "Base Set"),
  );
  const response = await loadPokeTraceSet(" base SET ", {
    peekCatalog: () => catalog([...matchingCards, card("other", "Base Set 2")]),
    warmCatalog: () => undefined,
  });

  assert.equal(response.total, POKETRACE_SEARCH_RESULT_LIMIT);
  assert.equal(response.items.length, POKETRACE_SEARCH_RESULT_LIMIT);
  assert.equal(
    response.items.some((item) => item.id === "other"),
    false,
  );
});

test("cold set loading uses Turso directly while warming the catalog", async () => {
  let warmed = 0;
  let directLoads = 0;
  const response = await loadPokeTraceSet("Base Set", {
    loadDirect: async (search) => {
      directLoads += 1;
      assert.equal(search.setName, "Base Set");
      assert.equal(search.setNameExact, true);
      return { items: [], total: 0 };
    },
    peekCatalog: () => null,
    warmCatalog: () => {
      warmed += 1;
    },
  });

  assert.deepEqual(response, { items: [], total: 0 });
  assert.equal(directLoads, 1);
  assert.equal(warmed, 1);
});
