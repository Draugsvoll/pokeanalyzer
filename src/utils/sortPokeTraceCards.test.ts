import { describe, expect, test } from "vitest";
import type { PokemonCard } from "../types/pokemon";
import { sortPokeTraceCards } from "./sortPokeTraceCards";

function card(
  id: string,
  number: string | undefined,
  price?: number,
  sevenDayPrice?: number,
) {
  return {
    id,
    name: id,
    ...(number && { number }),
    set: { id: "test", name: "Test Set" },
    pokeTrace: {
      currency: "USD",
      ...(sevenDayPrice !== undefined && {
        marketPriceSnapshots: { "7d": sevenDayPrice },
      }),
      marketplaceUrls: {},
      prices:
        price === undefined ? {} : { tcgplayer: { NEAR_MINT: { avg: price } } },
    },
  } satisfies PokemonCard;
}

describe("sortPokeTraceCards", () => {
  test("preserves fetched order when no sort is selected", () => {
    const cards = [card("second", "2", 10), card("first", "1", 20)];

    expect(sortPokeTraceCards(cards, "none").map(({ id }) => id)).toEqual([
      "second",
      "first",
    ]);
    expect(sortPokeTraceCards(cards, "none")).not.toBe(cards);
  });

  test("sorts mixed card-number formats naturally and leaves missing values last", () => {
    const cards = [
      card("missing", undefined),
      card("ten", "10/100"),
      card("promo-two", "SWSH002"),
      card("two", "2/100"),
      card("promo-ten", "SWSH010"),
    ];

    expect(
      sortPokeTraceCards(cards, "card-number-low-high").map(({ id }) => id),
    ).toEqual(["two", "ten", "promo-two", "promo-ten", "missing"]);
  });

  test("sorts Near Mint prices and leaves cards without one last", () => {
    const cards = [
      card("missing", "3"),
      card("low", "1", 10),
      card("high", "2", 20),
    ];

    expect(
      sortPokeTraceCards(cards, "price-high-low").map(({ id }) => id),
    ).toEqual(["high", "low", "missing"]);
    expect(
      sortPokeTraceCards(cards, "price-low-high").map(({ id }) => id),
    ).toEqual(["low", "high", "missing"]);
  });

  test("sorts 7-day percentage changes and leaves missing changes last", () => {
    const cards = [
      card("missing", "4", 30),
      card("down", "3", 80, 100),
      card("up-ten", "1", 110, 100),
      card("up-twenty", "2", 60, 50),
    ];

    expect(
      sortPokeTraceCards(cards, "change-high-low").map(({ id }) => id),
    ).toEqual(["up-twenty", "up-ten", "down", "missing"]);
    expect(
      sortPokeTraceCards(cards, "change-low-high").map(({ id }) => id),
    ).toEqual(["down", "up-ten", "up-twenty", "missing"]);
  });

  test("sorts the exact percentage supplied to the card display", () => {
    const cards = [
      card("default-winner", "1", 120, 100),
      card("displayed-winner", "2", 90, 100),
    ];
    const displayedChanges = new Map([
      ["default-winner", -5],
      ["displayed-winner", 25],
    ]);

    expect(
      sortPokeTraceCards(cards, "change-high-low", {
        getPriceChangeDisplayContext: ({ id }) => ({
          marketDisplay: {
            changePercent: displayedChanges.get(id),
          },
        }),
      }).map(({ id }) => id),
    ).toEqual(["displayed-winner", "default-winner"]);
  });

  test("leaves sub-$2 cards last when sorting by change", () => {
    const cards = [
      card("sub-threshold", "1", 1.99, 1),
      card("down", "2", 8, 10),
      card("up", "3", 11, 10),
    ];

    expect(
      sortPokeTraceCards(cards, "change-high-low").map(({ id }) => id),
    ).toEqual(["up", "down", "sub-threshold"]);
    expect(
      sortPokeTraceCards(cards, "change-low-high").map(({ id }) => id),
    ).toEqual(["down", "up", "sub-threshold"]);
  });
});
