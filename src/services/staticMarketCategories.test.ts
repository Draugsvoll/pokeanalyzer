import { afterEach, expect, test, vi } from "vitest";
import {
  dailyTcgNearMintGainers,
  fetchStaticMarketCategory,
  mostSoldCards,
} from "./staticMarketCategories";

afterEach(() => vi.unstubAllGlobals());

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
    },
    {
      id: "most-sold",
      items: [
        {
          cardId: "card-2",
          cardNumber: "10/102",
          ebaySales: 20,
          image: null,
          name: "Pikachu",
          rarity: "Common",
          setName: "Base Set",
          tcgplayerSales: 30,
          totalSales: 50,
          variant: "Normal",
        },
      ],
      parameters: { limit: 10, minimumSales: 1, source: "both" },
      snapshotDate: "2026-09-22",
    },
  ],
};

test("loads and maps a generated market category", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);

  const result = await dailyTcgNearMintGainers();

  expect(fetchMock).toHaveBeenCalledWith(
    "/market-categories.json",
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
});

test("rejects a missing category", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));

  await expect(fetchStaticMarketCategory("missing")).rejects.toThrow(
    "Static market category not found",
  );
});

test("loads the most-sold category with its configured source", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));

  const result = await mostSoldCards();

  expect(result.source).toBe("both");
  expect(result.snapshotDate).toBe("2026-09-22");
  expect(result.items[0]).toMatchObject({
    ebaySales: 20,
    tcgplayerSales: 30,
    totalSales: 50,
  });
});

test("accepts a most-sold category before snapshots are available", async () => {
  const withoutHistory = {
    ...payload,
    categories: payload.categories.map((category) =>
      category.id === "most-sold"
        ? {
            ...category,
            items: [],
            snapshotDate: null,
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

  expect(result.snapshotDate).toBeNull();
  expect(result.items).toEqual([]);
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
