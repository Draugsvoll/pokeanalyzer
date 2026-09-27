import { describe, expect, test } from "vitest";
import type { PokemonCard } from "../types/pokemon";
import {
  resolvePokeTraceCardPrice,
  resolvePokeTraceSevenDayComparison,
} from "./pokeTracePricing";

function cardWithPrices(prices: Record<string, unknown>): PokemonCard {
  return {
    id: "card-1",
    image: "",
    name: "Pikachu",
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices,
    },
    set: { id: "base-set", name: "Base Set" },
  };
}

describe("resolvePokeTraceCardPrice", () => {
  test("reads the TCGPlayer Near Mint market price directly from PokeTrace", () => {
    const card = cardWithPrices({
      tcgplayer: { NEAR_MINT: { avg: 42.5 } },
    });

    expect(resolvePokeTraceCardPrice(card)).toEqual({
      currency: "USD",
      currencySymbol: "$",
      price: 42.5,
    });
  });

  test("does not fall back to another condition", () => {
    const card = cardWithPrices({
      tcgplayer: { LIGHTLY_PLAYED: { avg: 30 } },
    });

    expect(resolvePokeTraceCardPrice(card)).toBeUndefined();
  });

  test("reads the requested TCGPlayer condition", () => {
    const card = cardWithPrices({
      tcgplayer: {
        NEAR_MINT: { avg: 42.5 },
        LIGHTLY_PLAYED: { avg: 30 },
      },
    });

    expect(resolvePokeTraceCardPrice(card, "LIGHTLY_PLAYED")?.price).toBe(30);
  });
});

describe("resolvePokeTraceSevenDayComparison", () => {
  test("reads the compact search-catalog snapshot", () => {
    const card = cardWithPrices({
      tcgplayer: { NEAR_MINT: { avg: 42.5 } },
    });
    card.pokeTrace.marketPriceSnapshots = {
      "1d": 40,
      "7d": 38,
      "30d": 35,
    };

    expect(resolvePokeTraceSevenDayComparison(card)).toEqual({
      marketPrice: 38,
      recordedAt: null,
    });
  });

  test("prefers the dated comparison when full card data is available", () => {
    const card = cardWithPrices({
      tcgplayer: { NEAR_MINT: { avg: 42.5 } },
    });
    card.pokeTrace.marketPriceSnapshots = { "7d": 40 };
    card.pokeTrace.marketComparisons = {
      asOf: "2026-09-26",
      comparisons: {
        "1d": null,
        "7d": {
          marketPrice: 41,
          recordedAt: "2026-09-19",
          sourceUpdatedAt: null,
          targetDate: "2026-09-19",
        },
        "30d": null,
      },
    };

    expect(resolvePokeTraceSevenDayComparison(card)).toEqual({
      marketPrice: 41,
      recordedAt: "2026-09-19",
    });
  });

  test("does not fall back to one day when seven-day history is unavailable", () => {
    const card = cardWithPrices({
      tcgplayer: { NEAR_MINT: { avg: 42.5 } },
    });
    card.pokeTrace.marketPriceSnapshots = { "1d": 40, "7d": null };

    expect(resolvePokeTraceSevenDayComparison(card)).toBeUndefined();
  });
});
