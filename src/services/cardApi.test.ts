import { afterEach, expect, test, vi } from "vitest";
import { fetchCardById, fetchMarketPriceHistory } from "./cardApi";

afterEach(() => vi.unstubAllGlobals());

test("loads a card from the active card API", async () => {
  const fixture = { id: "card-123", name: "Charizard" };
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => fixture,
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);

  const card = await fetchCardById("card-123");

  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/card-123",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(card.id).toBe("card-123");
  expect(card.name).toBe("Charizard");
});

test("loads the static demo without calling the card API", async () => {
  const fixture = { id: "demo", name: "Charizard" };
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => fixture,
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);

  const card = await fetchCardById("demo");

  expect(fetchMock).toHaveBeenCalledWith(
    "/demo-card.json",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(card.id).toBe("demo");
});

test("normalizes older demo eBay results without exposing them as AI data", async () => {
  const ebay = {
    timestamp: "2026-10-20",
    sold: { items: [] },
    active: { items: [] },
  };
  const analysis = { timestamp: "2026-10-20" };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "demo",
        name: "Charizard",
        grok: { ebay_sold: ebay, market_analysis: analysis },
      }),
    }),
  );
  const card = await fetchCardById("demo");
  expect(card.ebay).toEqual(ebay);
  expect(card.grok).toEqual({ market_analysis: analysis });
});

test.each(["90d", "all"])(
  "loads and validates cached %s marketplace price history",
  async (period) => {
    const fixture = {
      cardId: "card-123",
      condition: "NEAR_MINT",
      currency: "USD",
      fetchedAt: "2026-09-19T12:00:00.000Z",
      period,
      series: {
        tcgplayer: [
          {
            date: "2026-09-18",
            avg: 420,
            median7d: null,
            median30d: null,
            low: 400,
            high: 440,
            saleCount: 12,
            approxSaleCount: null,
          },
        ],
        ebay: [],
      },
      stale: false,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => fixture,
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const history = await fetchMarketPriceHistory("card-123");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/cards/card-123/market-price-history",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(history.series.tcgplayer?.[0].avg).toBe(420);
    expect(history.period).toBe(period);
  },
);

test("requests the selected graded tier and rejects a different tier's response", async () => {
  const fixture = {
    cardId: "card-123",
    condition: "BGS_9",
    period: "all",
    currency: "USD",
    fetchedAt: "2026-11-04T12:00:00Z",
    stale: false,
    series: { ebay: [] },
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => fixture });
  vi.stubGlobal("fetch", fetchMock);
  const history = await fetchMarketPriceHistory("card-123", undefined, "BGS_9");
  expect(history.condition).toBe("BGS_9");
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/card-123/market-price-history?tier=BGS_9",
    expect.objectContaining({ cache: "no-store" }),
  );
  await expect(
    fetchMarketPriceHistory("card-123", undefined, "PSA_10"),
  ).rejects.toThrow("another tier");
});
