import { afterEach, expect, test, vi } from "vitest";
import {
  clearMarketCategoriesCache,
  dailyTcgNearMintGainers,
  dailyTcgNearMintLosers,
  fetchMarketCategory,
  mostSoldCards,
  mostSoldEbayCards,
} from "./marketCategoriesApi";

afterEach(() => {
  clearMarketCategoriesCache();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const payload = {
  schemaVersion: 1,
  generatedAt: "2026-09-22T12:00:00.000Z",
  categories: [
    {
      id: "daily-tcg-near-mint-gainers",
      items: [
        {
          cardId: "card-1",
          cardNumber: "4/102",
          change: 20,
          changePercent: 20,
          condition: "NEAR_MINT",
          currency: "USD",
          currentPrice: 120,
          image: "https://example.com/card.webp",
          name: "Charizard",
          previousPrice: 100,
          rarity: "Holo Rare",
          saleCount: null,
          setName: "Base Set",
          source: "tcgplayer",
          variant: "Holofoil",
        },
      ],
      parameters: { direction: "gainers" },
    },
    {
      id: "daily-tcg-near-mint-losers",
      items: [
        {
          cardId: "card-4",
          cardNumber: "8/102",
          change: -20,
          changePercent: -20,
          condition: "NEAR_MINT",
          currency: "USD",
          currentPrice: 80,
          image: "https://example.com/loser.webp",
          name: "Machamp",
          previousPrice: 100,
          rarity: "Holo Rare",
          saleCount: 30,
          setName: "Base Set",
          source: "tcgplayer",
          variant: "Holofoil",
        },
      ],
      parameters: { direction: "losers" },
    },
    {
      comparisonSnapshotDate: "2026-09-21",
      currentSnapshotDate: "2026-09-22",
      id: "most-sold",
      items: [
        {
          cardId: "card-2",
          cardNumber: "10/102",
          currency: "USD",
          currentPrice: 25,
          image: null,
          name: "Pikachu",
          newSales: 7,
          prices: { NEAR_MINT: { avg: 25, saleCount: 37 } },
          rarity: "Common",
          setName: "Base Set",
          variant: "Normal",
        },
      ],
      parameters: {
        condition: "ALL",
        limit: 10,
        minimumNewSales: 1,
        minimumPrice: 20,
        periodDays: 1,
        source: "tcgplayer",
      },
    },
    {
      comparisonSnapshotDate: "2026-09-21",
      currentSnapshotDate: "2026-09-22",
      id: "most-sold-ebay",
      items: [
        {
          cardId: "card-3",
          cardNumber: "2/102",
          currency: "USD",
          currentPrice: 40,
          image: null,
          name: "Blastoise",
          newSales: 5,
          prices: { NEAR_MINT: { avg: 40, saleCount: 15 } },
          rarity: "Holo Rare",
          setName: "Base Set",
          variant: "Holofoil",
        },
      ],
      parameters: {
        condition: "ALL",
        limit: 10,
        minimumNewSales: 1,
        minimumPrice: 20,
        periodDays: 1,
        source: "ebay",
      },
    },
  ],
};

test("loads and maps a generated market category", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);

  const result = await dailyTcgNearMintGainers();

  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/market-categories",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(result.fetchedAt).toBe(payload.generatedAt);
  expect(result.items[0]).toMatchObject({
    cardId: "card-1",
    changeAbs: 20,
    changePct: 20,
    price7dAvg: 100,
    set: { name: "Base Set", slug: "base-set" },
    tier: "NEAR_MINT",
  });
  expect(result.query.direction).toBe("gainers");
});

test("rejects a missing category", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));

  await expect(fetchMarketCategory("missing")).rejects.toThrow(
    "Market category not found",
  );
});

test("loads and maps the generated daily losers category", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));

  const result = await dailyTcgNearMintLosers();

  expect(result.items[0]).toMatchObject({
    cardId: "card-4",
    changeAbs: -20,
    changePct: -20,
    currentPrice: 80,
  });
  expect(result.query.direction).toBe("losers");
});

test("loads the most-sold category with its configured source", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));

  const result = await mostSoldCards();

  expect(result.source).toBe("tcgplayer");
  expect(result.condition).toBe("ALL");
  expect(result.currentSnapshotDate).toBe("2026-09-22");
  expect(result.comparisonSnapshotDate).toBe("2026-09-21");
  expect(result.items[0]).toMatchObject({
    currentPrice: 25,
    newSales: 7,
    prices: { NEAR_MINT: { avg: 25, saleCount: 37 } },
  });
});

test("accepts a most-sold category before snapshots are available", async () => {
  const withoutHistory = {
    ...payload,
    categories: payload.categories.map((category) =>
      category.id === "most-sold"
        ? {
            ...category,
            comparisonSnapshotDate: null,
            currentSnapshotDate: null,
            items: [],
            status: "insufficient_history",
          }
        : category,
    ),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(withoutHistory)),
  );

  const result = await mostSoldCards();

  expect(result.currentSnapshotDate).toBeNull();
  expect(result.comparisonSnapshotDate).toBeNull();
  expect(result.items).toEqual([]);
});

test("loads the eBay most-sold category", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));

  const result = await mostSoldEbayCards();

  expect(result.source).toBe("ebay");
  expect(result.items[0]).toMatchObject({
    currentPrice: 40,
    name: "Blastoise",
    newSales: 5,
  });
});

test("accepts nullable category metadata without rejecting the whole category", async () => {
  const nullableMetadata = {
    ...payload,
    categories: payload.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => ({
        ...item,
        ...(category.id === "daily-tcg-near-mint-gainers"
          ? { currency: null, setName: null }
          : { setName: null }),
      })),
    })),
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json(nullableMetadata)),
      ),
  );

  const gainers = await dailyTcgNearMintGainers();
  const mostSold = await mostSoldCards();

  expect(gainers.items[0]).toMatchObject({
    currency: "USD",
    set: { name: "Unknown set", slug: "unknown-set" },
  });
  expect(mostSold.items[0]?.setName).toBeNull();
});

test("reuses the complete browser cache until its 24-hour TTL expires", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"));
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      Response.json({
        ...payload,
        generatedAt: new Date().toISOString(),
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  await dailyTcgNearMintGainers();
  await mostSoldEbayCards();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("pokelyzer:market-categories:v1")).not.toBeNull();

  vi.advanceTimersByTime(24 * 60 * 60 * 1_000);
  await dailyTcgNearMintLosers();

  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("falls back to the server when the browser cache is corrupt", async () => {
  localStorage.setItem("pokelyzer:market-categories:v1", "not-json");
  const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);

  const result = await dailyTcgNearMintGainers();

  expect(result.items[0]?.name).toBe("Charizard");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("shares one server request across categories", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);

  await Promise.all([
    dailyTcgNearMintGainers(),
    dailyTcgNearMintLosers(),
    mostSoldCards(),
    mostSoldEbayCards(),
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
});
