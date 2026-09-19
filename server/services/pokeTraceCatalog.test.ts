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
    market_price: 420,
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
    marketPrice: 420,
    priceSnapshots: { "1d": 410, "7d": null, "30d": 390 },
  });
});
