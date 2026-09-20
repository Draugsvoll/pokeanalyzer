import assert from "node:assert/strict";
import test from "node:test";
import type { MarketMoversQuery } from "../../shared/marketMovers.js";
import { createMarketMoversLoader } from "./pokeTraceMarketMovers.js";

const query: MarketMoversQuery = {
  direction: "gainers",
  game: "pokemon",
  limit: 6,
  market: "US",
  minPrice: 20,
};

function mover(overrides: Record<string, unknown> = {}) {
  return {
    approxSaleCount: false,
    cardId: "019bff77-befa-771d-bab0-f5909f0a78c9",
    cardNumber: "4/102",
    changeAbs: 20,
    changePct: 20,
    currentPrice: 120,
    game: "pokemon",
    image: "https://example.com/card.webp",
    name: "Charizard",
    price7dAvg: 100,
    rarity: "Holo Rare",
    saleCount: 12,
    set: { name: "Base Set", slug: "base-set" },
    source: "tcgplayer",
    tier: "NEAR_MINT",
    variant: "Holofoil",
    ...overrides,
  };
}

test("forwards filters to PokeTrace and caches each exact query", async () => {
  let requests = 0;
  const loader = createMarketMoversLoader({
    apiKey: () => "test-key",
    fetchImpl: async (input, init) => {
      requests += 1;
      const url = new URL(String(input));
      assert.equal(url.pathname, "/v1/cards/movers");
      assert.equal(url.searchParams.get("direction"), "gainers");
      assert.equal(url.searchParams.get("market"), "US");
      assert.equal(url.searchParams.get("limit"), "6");
      assert.equal(url.searchParams.get("min_price"), "20");
      assert.equal(
        (init?.headers as Record<string, string>)["X-API-Key"],
        "test-key",
      );
      return Response.json({
        data: [
          mover({
            source: url.searchParams.get("source") ?? "tcgplayer",
            tier: url.searchParams.get("tier") ?? "NEAR_MINT",
          }),
        ],
      });
    },
    now: () => Date.parse("2026-09-20T12:00:00.000Z"),
  });

  const filteredQuery = {
    ...query,
    source: "tcgplayer",
    tier: "NEAR_MINT",
  };
  const first = await loader(filteredQuery);
  const second = await loader(filteredQuery);
  const ebay = await loader({
    ...query,
    source: "ebay",
    tier: "PSA_10",
  });

  assert.equal(requests, 2);
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].currency, "USD");
  assert.equal(first.items[0].changePct, 20);
  assert.deepEqual(second, first);
  assert.equal(ebay.items.length, 1);
  assert.equal(ebay.items[0].source, "ebay");
});

test("returns mover cards in the order received without local filtering", async () => {
  const upstreamItems = [
    mover({ cardId: "first", currentPrice: 5, name: "First" }),
    mover({ cardId: "second", changePct: -80, name: "Second" }),
  ];
  const loader = createMarketMoversLoader({
    apiKey: () => "test-key",
    fetchImpl: async () => Response.json({ data: upstreamItems }),
  });

  const response = await loader({ ...query, limit: 1, minPrice: 1_000 });

  assert.deepEqual(
    response.items.map((item) => item.cardId),
    ["first", "second"],
  );
});

test("keeps the default mover cache for 6 hours", async () => {
  let currentTime = Date.parse("2026-09-20T12:00:00.000Z");
  let requests = 0;
  const loader = createMarketMoversLoader({
    apiKey: () => "test-key",
    fetchImpl: async () => {
      requests += 1;
      return Response.json({ data: [mover()] });
    },
    now: () => currentTime,
  });

  await loader(query);
  currentTime += 6 * 60 * 60 * 1000 - 1;
  await loader(query);
  assert.equal(requests, 1);

  currentTime += 1;
  await loader(query);
  assert.equal(requests, 2);
});

test("can bypass the cache while mover categories are tested", async () => {
  let requests = 0;
  const loader = createMarketMoversLoader({
    apiKey: () => "test-key",
    cacheTtlMs: 0,
    fetchImpl: async () => {
      requests += 1;
      return Response.json({ data: [mover()] });
    },
  });

  await loader(query);
  await loader(query);

  assert.equal(requests, 2);
});

test("serves stale movers if an expired cache cannot refresh", async () => {
  let currentTime = Date.parse("2026-09-20T12:00:00.000Z");
  let requests = 0;
  const loader = createMarketMoversLoader({
    apiKey: () => "test-key",
    cacheTtlMs: 1_000,
    fetchImpl: async () => {
      requests += 1;
      if (requests > 1) throw new Error("upstream unavailable");
      return Response.json({ data: [mover()] });
    },
    now: () => currentTime,
  });

  const fresh = await loader(query);
  currentTime += 1_001;
  const stale = await loader(query);

  assert.equal(fresh.stale, false);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.items, fresh.items);
});
