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

test("loads and validates cached marketplace price history", async () => {
  const fixture = {
    cardId: "card-123",
    condition: "NEAR_MINT",
    currency: "USD",
    fetchedAt: "2026-09-19T12:00:00.000Z",
    period: "90d",
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
});
