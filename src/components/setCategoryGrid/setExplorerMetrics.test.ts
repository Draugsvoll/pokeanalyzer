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
    expect(overview.totalValue).toBe(140);
    expect(overview.topCard).toMatchObject({
      card: { id: "001/102" },
      percentChange: 25,
      price: 100,
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

  test("resolves highest and lowest total sales leaders to their set cards", () => {
    const cards = [
      card("total", { NEAR_MINT: { avg: 100 } }, 90),
      card("weekly", { NEAR_MINT: { avg: 40 } }, 35),
    ];
    const overview = buildSetExplorerOverview(cards, {
      leastTotal: { approximate: false, cardId: "weekly", sales: 8 },
      total: { approximate: true, cardId: "total", sales: 602 },
    });

    expect(overview.salesLeaders).toMatchObject({
      leastTotal: {
        approximate: false,
        card: { id: "weekly" },
        sales: 8,
      },
      total: {
        approximate: true,
        card: { id: "total" },
        sales: 602,
      },
    });
  });
});
