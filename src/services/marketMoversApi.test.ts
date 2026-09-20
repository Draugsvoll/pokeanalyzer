import { afterEach, expect, test, vi } from "vitest";
import type { MarketMoversQuery } from "../../shared/marketMovers";
import {
  fetchMarketMovers,
  weeklyGainersTcgNearMint,
  weeklyLosersTcgNearMint,
} from "./marketMoversApi";

afterEach(() => vi.unstubAllGlobals());

const query: MarketMoversQuery = {
  direction: "losers",
  game: "pokemon",
  limit: 6,
  market: "US",
  minPrice: 20,
  source: "tcgplayer",
  tier: "NEAR_MINT",
};

test("requests and validates configurable market movers", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      fetchedAt: "2026-09-20T12:00:00.000Z",
      items: [
        {
          approxSaleCount: false,
          cardId: "card-1",
          cardNumber: "4/102",
          changeAbs: -20,
          changePct: -16.67,
          currency: "USD",
          currentPrice: 100,
          game: "pokemon",
          image: null,
          name: "Charizard",
          price7dAvg: 120,
          rarity: "Holo Rare",
          saleCount: 12,
          set: { name: "Base Set", slug: "base-set" },
          source: "tcgplayer",
          tier: "NEAR_MINT",
          variant: "Holofoil",
        },
      ],
      query,
      stale: false,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await fetchMarketMovers(query);
  const requestUrl = new URL(fetchMock.mock.calls[0][0]);

  expect(requestUrl.pathname).toBe("/api/cards/movers");
  expect(requestUrl.searchParams.get("direction")).toBe("losers");
  expect(requestUrl.searchParams.get("source")).toBe("tcgplayer");
  expect(requestUrl.searchParams.get("tier")).toBe("NEAR_MINT");
  expect(response.items[0].changePct).toBe(-16.67);
});

test("weekly TCGPlayer Near Mint categories use their predefined queries", async () => {
  const fetchMock = vi.fn().mockImplementation(() =>
    Promise.resolve(
      Response.json({
        fetchedAt: "2026-09-20T12:00:00.000Z",
        items: [],
        query: {},
        stale: false,
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  await weeklyGainersTcgNearMint();
  await weeklyLosersTcgNearMint();

  const urls = fetchMock.mock.calls.map(([input]) => new URL(input));
  expect(urls.map((url) => url.searchParams.get("direction"))).toEqual([
    "gainers",
    "losers",
  ]);
  for (const url of urls) {
    expect(url.searchParams.get("source")).toBe("tcgplayer");
    expect(url.searchParams.get("tier")).toBe("NEAR_MINT");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("minPrice")).toBe("20");
  }
});
