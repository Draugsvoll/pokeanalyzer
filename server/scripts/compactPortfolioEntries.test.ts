import assert from "node:assert/strict";
import test from "node:test";
import {
  compactPortfolioDocument,
  getProtectedPortfolioFields,
} from "./portfolioCompactionHelpers.js";

test("portfolio compaction preserves legacy numeric-string quantities", () => {
  assert.deepEqual(
    compactPortfolioDocument({
      id: "base1-1",
      name: "Alakazam",
      priceSource: "tcgplayer:holofoil",
      quantity: "5",
    }),
    {
      priceSource: "tcgplayer:holofoil",
      quantity: 5,
    },
  );
});

test("portfolio compaction protects unknown user-owned fields", () => {
  assert.deepEqual(
    getProtectedPortfolioFields({
      grok: { summary: "recognized duplicated card data" },
      name: "Alakazam",
      notes: "Do not remove",
      purchasePrice: 12,
      quantity: 1,
    }),
    ["notes", "purchasePrice"],
  );
});
