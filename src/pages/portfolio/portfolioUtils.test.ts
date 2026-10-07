import { describe, expect, test } from "vitest";
import type {
  PortfolioSealedProduct,
  PortfolioSingle,
} from "../../types/portfolio";
import {
  getPortfolioStats,
  getVisiblePortfolioItems,
  portfolioPriceChange,
} from "./portfolioUtils";

function card(
  id: string,
  name: string,
  price: number | null,
  quantity = 1,
  snapshot7d: number | null = null,
): PortfolioSingle {
  return {
    id,
    name,
    number: id,
    quantity,
    type: "single",
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
      biggestGainer: {
        item: cards[0],
        change: 25,
        value: 200,
      },
      weakestPerformer: {
        item: cards[1],
        change: 0,
        value: 50,
      },
      changePercent: (40 / 210) * 100,
      pricedAssets: 3,
      singleAssets: 6,
      sealedAssets: 0,
      topHolding: { item: cards[0], change: 25, value: 100 },
      totalAssets: 6,
      totalValue: 250,
      uniqueAssets: 3,
    });
  });

  test("uses the highest selected-period change as the biggest gainer", () => {
    const down = card("1", "Down", 90, 1, 100);
    const smallGain = card("2", "Small gain", 110, 2, 100);
    const biggestGain = card("3", "Biggest gain", 150, 1, 100);
    const unavailable = card("4", "Unavailable", 200);

    expect(
      getPortfolioStats([down, smallGain, biggestGain, unavailable], "7d")
        .biggestGainer,
    ).toEqual({ item: biggestGain, change: 50, value: 150 });
    expect(
      getPortfolioStats([down, smallGain, biggestGain, unavailable], "7d")
        .weakestPerformer,
    ).toEqual({ item: down, change: -10, value: 90 });
    expect(getPortfolioStats([down, unavailable], "7d").biggestGainer).toEqual({
      item: down,
      change: -10,
      value: 90,
    });
  });

  test("selects the top holding by unit price rather than quantity", () => {
    const manyCopies = card("1", "Many copies", 25, 10);
    const highestUnitValue = card("2", "Highest unit value", 100);

    expect(
      getPortfolioStats([manyCopies, highestUnitValue], "7d").topHolding,
    ).toEqual({ item: highestUnitValue, change: null, value: 100 });
  });

  test("sorts by the same selected-period change rendered by portfolio cards", () => {
    const down = card("1", "Down", 90, 1, 100);
    const up = card("2", "Up", 120, 1, 100);
    const unavailable = card("3", "Unavailable", 200);

    expect(portfolioPriceChange(up, "7d")).toBe(20);
    expect(
      getVisiblePortfolioItems(
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
      getVisiblePortfolioItems([match], "base holo 4", "unsorted", "7d"),
    ).toEqual([match]);
    expect(
      getVisiblePortfolioItems([match], "004/102", "unsorted", "7d"),
    ).toEqual([match]);
  });

  test("combines singles and sealed quantities in the asset count", () => {
    const single = card("4", "Charizard", 100, 2, 80);
    const sealed: PortfolioSealedProduct = {
      currency: "USD",
      id: "box-1",
      name: "Booster Box",
      price: 150,
      priceSnapshots: { "1d": null, "7d": 125, "30d": null },
      productFamily: "booster_box",
      quantity: 3,
      setName: "Base Set",
      type: "sealed",
    };

    expect(getPortfolioStats([single, sealed], "7d")).toMatchObject({
      sealedAssets: 3,
      singleAssets: 2,
      totalAssets: 5,
      uniqueAssets: 2,
      totalValue: 650,
    });
  });
});
