import assert from "node:assert/strict";
import test from "node:test";
import { toPokemonCard } from "./pokeTraceCardView.js";

test("legacy eBay results are exposed separately from AI responses", () => {
  const ebay = {
    timestamp: "2026-10-20",
    sold: { items: [] },
    active: { items: [] },
  };
  const market = { timestamp: "2026-10-20" };
  const card = toPokemonCard(
    { id: "card-1", name: "Nidoking" },
    { grok: { ebay_sold: ebay, market_analysis: market } },
  );
  assert.deepEqual(card.ebay, ebay);
  assert.deepEqual(card.grok, { market_analysis: market });
  const updatedEbay = { ...ebay, timestamp: "2026-10-21" };
  assert.deepEqual(
    toPokemonCard(
      { id: "card-1", name: "Nidoking" },
      { ebay: updatedEbay, grok: { ebay_sold: ebay } },
    ).ebay,
    updatedEbay,
  );
});

test("PokeTrace cards are mapped to the app card model", () => {
  const card = toPokemonCard(
    {
      id: "019bff77-bef8-74a5-99d8-6e90eedb5803",
      name: "Alakazam",
      cardNumber: "001/102",
      set: { slug: "base-set", name: "Base Set" },
      rarity: "Holo Rare",
      variant: "Holofoil",
      image: "https://example.test/alakazam.webp",
      currency: "USD",
      lastUpdated: "2026-09-16T00:00:00.000Z",
      marketplaceUrls: {
        tcgplayer: "https://example.test/tcgplayer",
        ebay: "https://example.test/ebay",
      },
      prices: {
        tcgplayer: {
          NEAR_MINT: { avg: 68.8, low: 67, high: 70, saleCount: 344 },
        },
        ebay: { NEAR_MINT: { avg: 69.99 } },
      },
    },
    { grok: { market_analysis: { timestamp: "2026-09-16" } } },
    [
      { id: "variant-holo", name: "Holofoil" },
      { id: "variant-normal", name: "Normal" },
    ],
    {
      asOf: "2026-09-17",
      comparisons: {
        "1d": {
          targetDate: "2026-09-16",
          recordedAt: "2026-09-16",
          marketPrice: 65,
          sourceUpdatedAt: "2026-09-16T00:00:00.000Z",
        },
        "7d": null,
        "30d": null,
      },
    },
  );

  assert.equal(card.id, "019bff77-bef8-74a5-99d8-6e90eedb5803");
  assert.equal("tcgplayer" in card, false);
  assert.equal(card.number, "001/102");
  assert.equal(card.image, "https://example.test/alakazam.webp");
  assert.equal(
    (card.pokeTrace.prices.tcgplayer as { NEAR_MINT: { avg: number } })
      .NEAR_MINT.avg,
    68.8,
  );
  assert.equal(card.pokeTrace.prices.ebay !== undefined, true);
  assert.deepEqual(card.pokeTrace.variants, [
    { id: "variant-holo", name: "Holofoil" },
    { id: "variant-normal", name: "Normal" },
  ]);
  assert.deepEqual(card.grok, {
    market_analysis: { timestamp: "2026-09-16" },
  });
  assert.equal(
    card.pokeTrace.marketComparisons?.comparisons["1d"]?.marketPrice,
    65,
  );
});
