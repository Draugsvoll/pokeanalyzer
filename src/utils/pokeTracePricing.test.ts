import { describe, expect, test } from "vitest";
import type { PokemonCard } from "../types/pokemon";
import { resolvePokeTraceCardPrice } from "./pokeTracePricing";

function cardWithPrices(prices: Record<string, unknown>): PokemonCard {
  return {
    id: "card-1",
    images: { large: "", small: "" },
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
});
