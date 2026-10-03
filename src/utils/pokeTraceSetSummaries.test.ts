import { describe, expect, test } from "vitest";
import type { PokeTraceCatalogCard } from "../../shared/pokeTraceCatalog";
import { createPokeTraceSetSummaries } from "../../shared/pokeTraceSetSummaries";

function card(
  id: string,
  number: string | undefined,
  currentPrice: number | null,
  sevenDayPrice: number | null,
): PokeTraceCatalogCard {
  return {
    id,
    name: id,
    ...(number && { number }),
    setName: "Base Set",
    currency: "USD",
    conditionPrices: currentPrice === null ? {} : { NEAR_MINT: currentPrice },
    priceSnapshots: { "1d": null, "7d": sevenDayPrice, "30d": null },
  };
}

describe("createPokeTraceSetSummaries", () => {
  test("uses the same cheapest-valid unique-card rule as Set Explorer", () => {
    const asOf = "2026-10-03T01:00:00.000Z";
    const summaries = createPokeTraceSetSummaries(
      [
        card("expensive-print", "1/102", 20, 10),
        card("cheap-print", "1/102", 10, 8),
        card("missing-price", "2/102", null, 4),
        card("priced-print", "2/102", 30, 20),
        card("no-history", "3/102", 5, null),
        card("unnumbered-a", undefined, 2, 1),
        card("unnumbered-b", undefined, 3, 2),
      ],
      asOf,
    );

    expect(summaries).toEqual([
      {
        asOf,
        comparableCards: 4,
        currency: "USD",
        pricedCards: 5,
        setName: "Base Set",
        sevenDayChangePercent: ((45 - 31) / 31) * 100,
        uniqueCards: 5,
      },
    ]);
  });

  test("keeps a set available when it has no usable comparison history", () => {
    const [summary] = createPokeTraceSetSummaries(
      [card("new-card", "1/1", 10, null)],
      "2026-10-03T01:00:00.000Z",
    );

    expect(summary.sevenDayChangePercent).toBeNull();
    expect(summary.comparableCards).toBe(0);
    expect(summary.pricedCards).toBe(1);
  });

  test("does not substitute a pricier duplicate when the selected card lacks history", () => {
    const [summary] = createPokeTraceSetSummaries(
      [
        card("cheap-no-history", "1/1", 6, null),
        card("expensive-with-history", "1/1", 7, 5),
      ],
      "2026-10-03T01:00:00.000Z",
    );

    expect(summary.uniqueCards).toBe(1);
    expect(summary.pricedCards).toBe(1);
    expect(summary.comparableCards).toBe(0);
    expect(summary.sevenDayChangePercent).toBeNull();
  });
});
