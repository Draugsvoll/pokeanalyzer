import { describe, expect, test } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { buildSetExplorerOverview } from "./setExplorerMetrics";

function card(
  id: string,
  prices: Record<string, { avg: number }>,
  sevenDayPrice: number | null,
  currency = "USD",
): PokemonCard {
  return {
    id,
    image: `${id}.webp`,
    name: id,
    number: id,
    set: { id: "base-set", name: "Base Set" },
    pokeTrace: {
      currency,
      marketplaceUrls: {},
      marketPriceSnapshots: {
        "1d": null,
        "7d": sevenDayPrice,
        "30d": null,
      },
      prices: { tcgplayer: prices },
    },
  };
}

describe("buildSetExplorerOverview", () => {
  test("totals Near Mint prices and selects the most valuable card", () => {
    const overview = buildSetExplorerOverview([
      card(
        "001/102",
        { NEAR_MINT: { avg: 100 }, LIGHTLY_PLAYED: { avg: 70 } },
        80,
      ),
      card(
        "002/102",
        { NEAR_MINT: { avg: 40 }, LIGHTLY_PLAYED: { avg: 25 } },
        50,
      ),
      card("003/102", { LIGHTLY_PLAYED: { avg: 10 } }, null),
    ]);

    expect(overview.pricedCards).toBe(2);
    expect(overview.uniqueCards).toBe(3);
    expect(overview.variantCards).toBe(0);
    expect(overview.changePeriod).toBe("7d");
    expect(overview.totalValue).toBe(140);
    expect(overview.mostValuable).toMatchObject({
      card: { id: "001/102" },
      percentChange: 25,
      price: 100,
    });
    expect(overview.bestPerformer).toMatchObject({
      card: { id: "001/102" },
      percentChange: 25,
      price: 100,
    });
  });

  test("reports unique cards separately from all variants", () => {
    const unique = card("unique", { NEAR_MINT: { avg: 100 } }, 80);
    const variant = {
      ...card("variant", { NEAR_MINT: { avg: 120 } }, 100),
      number: unique.number,
    };
    const overview = buildSetExplorerOverview([unique], null, [
      unique,
      variant,
    ]);

    expect(overview.totalCards).toBe(1);
    expect(overview.uniqueCards).toBe(1);
    expect(overview.variantCards).toBe(1);
  });

  test("selects the card with the highest seven-day percentage change", () => {
    const overview = buildSetExplorerOverview([
      card("valuable", { NEAR_MINT: { avg: 200 } }, 180),
      card("gainer", { NEAR_MINT: { avg: 60 } }, 30),
      card("missing", { NEAR_MINT: { avg: 300 } }, null),
    ]);

    expect(overview.bestPerformer).toMatchObject({
      card: { id: "gainer" },
      percentChange: 100,
      price: 60,
    });
  });

  test("excludes cards below the gainer and loser price threshold", () => {
    const overview = buildSetExplorerOverview([
      card("cheap", { NEAR_MINT: { avg: 1.99 } }, 0.5),
      card("eligible", { NEAR_MINT: { avg: 2 } }, 1.5),
    ]);

    expect(overview.bestPerformer).toMatchObject({
      card: { id: "eligible" },
      percentChange: (0.5 / 1.5) * 100,
      price: 2,
    });
  });

  test("calculates movement only from cards with comparable Near Mint data", () => {
    const overview = buildSetExplorerOverview([
      card("one", { NEAR_MINT: { avg: 100 } }, 80),
      card("two", { NEAR_MINT: { avg: 40 } }, 50),
      card("missing", { NEAR_MINT: { avg: 200 } }, null),
      card("eur", { NEAR_MINT: { avg: 500 } }, 400, "EUR"),
    ]);

    expect(overview.currency).toBe("USD");
    expect(overview.movementPercent).toBe((10 / 130) * 100);
  });

  test("resolves the highest total sales leader to its set card", () => {
    const cards = [
      card("total", { NEAR_MINT: { avg: 100 } }, 90),
      card("weekly", { NEAR_MINT: { avg: 40 } }, 35),
    ];
    const overview = buildSetExplorerOverview(cards, {
      total: { cardId: "total" },
    });

    expect(overview.mostSold).toMatchObject({
      card: { id: "total" },
      currency: "USD",
      percentChange: (10 / 90) * 100,
      price: 100,
    });
  });
});
