import assert from "node:assert/strict";
import test from "node:test";
import { toPokeTraceCatalogCard } from "./pokeTraceCatalog.js";

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
