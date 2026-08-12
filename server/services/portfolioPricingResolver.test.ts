import assert from "node:assert/strict";
import test from "node:test";
import {
  getDirectPriceChangeForOption,
  resolvePortfolioCardPriceOption,
} from "../../src/utils/pokemonPricing.js";

const card = {
  tcgplayer: {
    url: "",
    updatedAt: "",
    prices: {
      normal: {
        low: 90,
        mid: 95,
        high: 110,
        market: 100,
        directLow: null,
      },
      holofoil: {
        low: 180,
        mid: 190,
        high: 230,
        market: 217.5,
        directLow: null,
      },
    },
  },
  cardmarket: {
    url: "",
    updatedAt: "",
    prices: {
      averageSellPrice: 120,
      germanProLow: 100,
      lowPrice: 90,
      suggestedPrice: 125,
      trendPrice: 122.4,
    },
  },
  justtcg: {
    updatedAt: "",
    prices: {
      "pokemon-base-set-charizard-holo-rare:holofoil-near-mint": {
        cardId: "pokemon-base-set-charizard-holo-rare",
        condition: "Near Mint",
        market: 800,
        percentChange7d: 12.5,
        percentChange30d: 40,
        printing: "Holofoil",
      },
    },
  },
  priceSources: {
    tcgplayer: "holofoil",
    justtcg: "pokemon-base-set-charizard-holo-rare:holofoil-near-mint",
  },
};

test("All-mode resolver and JustTCG percent change use the same selected option", () => {
  const justTcgOption = resolvePortfolioCardPriceOption(card, "all");

  assert.equal(justTcgOption?.source, "justtcg");
  assert.equal(justTcgOption?.key, card.priceSources.justtcg);
  assert.equal(justTcgOption?.price, 800);
  assert.equal(getDirectPriceChangeForOption(card, justTcgOption, "24h"), 0);
  assert.equal(getDirectPriceChangeForOption(card, justTcgOption, "7d"), 12.5);
  assert.equal(getDirectPriceChangeForOption(card, justTcgOption, "30d"), 40);

  const tcgOption = resolvePortfolioCardPriceOption(
    { ...card, allPriceSource: "tcgplayer" },
    "all",
  );

  assert.equal(tcgOption?.source, "tcgplayer");
  assert.equal(tcgOption?.key, "holofoil");
  assert.equal(tcgOption?.price, 217.5);
  assert.equal(getDirectPriceChangeForOption(card, tcgOption, "24h"), undefined);
});
