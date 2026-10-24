import { parsePokeTraceFilterOptions } from "../../shared/pokeTraceFilterOptions";
import { describe, expect, test } from "vitest";
import type { PokeTraceCatalogCard } from "../../shared/pokeTraceCatalog";
import { createPokeTraceSetSummaries } from "../../shared/pokeTraceSetSummaries";

function card(
  id: string,
  number: string | undefined,
  currentPrice: number | null,
  sevenDayPrice: number | null,
  currency = "USD",
): PokeTraceCatalogCard {
  return {
    id,
    name: id,
    ...(number && { number }),
    setName: "Base Set",
    currency,
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

  test("always summarizes every priced card in USD", () => {
    const [summary] = createPokeTraceSetSummaries(
      [card("usd", "1/2", 10, 8), card("mislabeled", "2/2", 20, 10, "EUR")],
      "2026-10-03T01:00:00.000Z",
    );

    expect(summary).toMatchObject({
      comparableCards: 2,
      currency: "USD",
      pricedCards: 2,
      sevenDayChangePercent: (12 / 18) * 100,
    });
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

test.each([1.99, 2, 2.01])("checks the set total against $2 (%s)", (total) => {
  const [summary] = createPokeTraceSetSummaries(
    [card("first", "1", total / 2, 0.5), card("second", "2", total / 2, 0.5)],
    "2026-10-03T01:00:00.000Z",
  );
  expect(summary.pricedCards).toBe(2);
  expect(summary.comparableCards).toBe(2);
  if (total < 2) expect(summary.sevenDayChangePercent).toBeNull();
  else expect(summary.sevenDayChangePercent).toBeCloseTo((total - 1) * 100);
});

test("includes cheap cards in eligible set movement", () => {
  const [summary] = createPokeTraceSetSummaries(
    [card("cheap", "1", 1, 0.5), card("expensive", "2", 9, 9.5)],
    "2026-10-03T01:00:00.000Z",
  );
  expect(summary.sevenDayChangePercent).toBe(0);
  expect(summary.comparableCards).toBe(2);
});

test("uses the full set value for eligibility even when some cards lack history", () => {
  const [summary] = createPokeTraceSetSummaries(
    [card("comparable", "1", 1, 0.5), card("no-history", "2", 2, null)],
    "2026-10-03T01:00:00.000Z",
  );
  expect(summary.sevenDayChangePercent).toBe(100);
});

test("preserves existing version-2 summaries", () => {
  const summaries = createPokeTraceSetSummaries(
    [card("eligible", "1", 10, 5)],
    "2026-10-03T01:00:00Z",
  );
  const result = parsePokeTraceFilterOptions({
    schemaVersion: 2,
    generatedAt: "2026-10-03T01:00:00Z",
    rarities: [],
    setNames: ["Base Set"],
    setSummaries: summaries,
  });
  expect(result.schemaVersion).toBe(2);
  expect(result.setSummaries).toEqual(summaries);
  expect(result.setSummaries[0].sevenDayChangePercent).toBe(100);
});
