import { describe, expect, test } from "vitest";
import type { PortfolioCard } from "../../types/portfolio";
import {
  getPortfolioStats,
  getVisiblePortfolioCards,
  portfolioPriceChange,
} from "./portfolioUtils";

function card(
  id: string,
  name: string,
  price: number | null,
  quantity = 1,
  snapshot7d: number | null = null,
): PortfolioCard {
  return {
    id,
    name,
    number: id,
    quantity,
    rarity: "Rare Holo",
    set: { id: "base", name: "Base Set", printedTotal: 102 },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices: price == null ? {} : { tcgplayer: { NEAR_MINT: { avg: price } } },
    },
    priceSnapshots:
      snapshot7d == null
        ? undefined
        : {
            "7d": {
              marketPrice: snapshot7d,
              recordedAt: "2026-09-20T00:00:00.000Z",
              sourceUpdatedAt: null,
            },
          },
  };
}

describe("portfolio utilities", () => {
  test("calculates collection value, quantities, top holding, and comparable change", () => {
    const cards = [
      card("4", "Charizard", 100, 2, 80),
      card("2", "Blastoise", 50, 1, 50),
      card("1", "Missing price", null, 3),
    ];

    expect(getPortfolioStats(cards, "7d")).toMatchObject({
      changeAmount: 40,
      changePercent: (40 / 210) * 100,
      comparableCards: 3,
      pricedCards: 3,
      topHolding: { card: cards[0], value: 200 },
      totalCards: 6,
      totalValue: 250,
      uniqueCards: 3,
    });
  });

  test("sorts by the same selected-period change rendered by portfolio cards", () => {
    const down = card("1", "Down", 90, 1, 100);
    const up = card("2", "Up", 120, 1, 100);
    const unavailable = card("3", "Unavailable", 200);

    expect(portfolioPriceChange(up, "7d")).toBe(20);
    expect(
      getVisiblePortfolioCards(
        [down, unavailable, up],
        "",
        "change-high",
        "7d",
      ).map((item) => item.name),
    ).toEqual(["Up", "Down", "Unavailable"]);
  });

  test("filters across card, set, rarity, number, and variant", () => {
    const match = card("4", "Charizard", 100);
    match.pokeTrace.variant = "1ST_EDITION_HOLO";

    expect(
      getVisiblePortfolioCards([match], "base holo 4", "unsorted", "7d"),
    ).toEqual([match]);
    expect(
      getVisiblePortfolioCards([match], "004/102", "unsorted", "7d"),
    ).toEqual([match]);
  });
});
