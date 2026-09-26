import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import express from "express";
import {
  acceptsGzip,
  createMarketPriceHistoryHandler,
  createMarketMoversHandler,
  createPokeTraceSearchHandler,
  createPokeTracePriceHistoryHandler,
  loadPokeTracePriceHistory,
  selectUnambiguousVariants,
} from "./pokeTraceRoutes.js";
import { requestFromTestServer } from "./httpTestServer.js";

const cardId = "019bff77-befa-771d-bab0-f5909f0a78c9";

test("catalog gzip negotiation respects an explicit zero quality", () => {
  assert.equal(acceptsGzip("br, gzip"), true);
  assert.equal(acceptsGzip("gzip; q=1.0, br"), true);
  assert.equal(acceptsGzip("gzip;q=0, br"), false);
  assert.equal(acceptsGzip(undefined), false);
});

test("market movers forwards validated customizable filters", async () => {
  const app = express();
  app.get(
    "/api/cards/movers",
    createMarketMoversHandler({
      loadMovers: async (query) => {
        assert.deepEqual(query, {
          direction: "losers",
          game: "pokemon",
          hasGraded: false,
          limit: 8,
          market: "US",
          maxDiff: 75,
          minPrice: 20,
          source: "tcgplayer",
          tier: "NEAR_MINT",
        });
        return {
          fetchedAt: "2026-09-20T12:00:00.000Z",
          items: [],
          query,
          stale: false,
        };
      },
      reportError: () => {
        assert.fail("The successful request must not be logged as an error");
      },
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/cards/movers?direction=losers&limit=8&market=US&game=pokemon&minPrice=20&maxDiff=75&hasGraded=false&source=tcgplayer&tier=NEAR_MINT",
  );

  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { stale: boolean }).stale, false);
});

test("market movers rejects unsupported filters before loading", async () => {
  const app = express();
  let calls = 0;
  app.get(
    "/api/cards/movers",
    createMarketMoversHandler({
      loadMovers: async () => {
        calls += 1;
        throw new Error("must not load");
      },
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/cards/movers?direction=sideways&limit=200",
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("card search forwards validated filters and sorting", async () => {
  const app = express();
  app.get(
    "/api/cards/search",
    createPokeTraceSearchHandler({
      loadSearch: async (query) => {
        assert.deepEqual(query, {
          cardId: "",
          cardNumber: "",
          condition: "LIGHTLY_PLAYED",
          maxPrice: 30,
          minPrice: 20,
          pokemonName: "",
          rarity: "Common",
          setName: "",
          sort: "price-low-high",
        });
        return { items: [], total: 0 };
      },
      reportError: () => {
        assert.fail("The successful request must not be logged as an error");
      },
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/cards/search?minPrice=20&maxPrice=30&rarity=Common&condition=LIGHTLY_PLAYED&sort=price-low-high",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [],
    total: 0,
  });
});

test("card search rejects invalid filters before querying the database", async () => {
  const app = express();
  let calls = 0;
  app.get(
    "/api/cards/search",
    createPokeTraceSearchHandler({
      loadSearch: async () => {
        calls += 1;
        throw new Error("must not load");
      },
    }),
  );

  for (const query of [
    "",
    "condition=MINTY",
    "pokemonName=pikachu&minPrice=30&maxPrice=20",
    "pokemonName=pikachu&sort=name",
  ]) {
    const response = await requestFromTestServer(
      app,
      `/api/cards/search${query ? `?${query}` : ""}`,
    );
    assert.equal(response.status, 400);
  }

  assert.equal(calls, 0);
});

test("variant selection keeps exact and unambiguous card identities", () => {
  const variants = selectUnambiguousVariants(
    [
      { id: "current", variant: "Normal", tcgplayer_id: 10 },
      { id: "duplicate", variant: "Normal", tcgplayer_id: 20 },
      { id: "holo", variant: "Holofoil", tcgplayer_id: 10 },
      { id: "reverse", variant: "Reverse Holofoil", tcgplayer_id: 10 },
    ],
    "current",
    10,
  );

  assert.deepEqual(variants, [
    { id: "current", name: "Normal" },
    { id: "holo", name: "Holofoil" },
    { id: "reverse", name: "Reverse Holofoil" },
  ]);
});

test("variant selection omits a badge when its card identity is ambiguous", () => {
  const variants = selectUnambiguousVariants(
    [
      { id: "current", variant: "Normal", tcgplayer_id: 10 },
      { id: "holo-a", variant: "Holofoil", tcgplayer_id: 20 },
      { id: "holo-b", variant: "Holofoil", tcgplayer_id: 30 },
    ],
    "current",
    10,
  );

  assert.deepEqual(variants, [{ id: "current", name: "Normal" }]);
});

test("variant selection can disambiguate a duplicate label by TCGPlayer product", () => {
  const variants = selectUnambiguousVariants(
    [
      { id: "current", variant: "Normal", tcgplayer_id: 10 },
      { id: "holo-match", variant: "Holofoil", tcgplayer_id: 10 },
      { id: "holo-other", variant: "Holofoil", tcgplayer_id: 20 },
    ],
    "current",
    10,
  );

  assert.deepEqual(variants, [
    { id: "current", name: "Normal" },
    { id: "holo-match", name: "Holofoil" },
  ]);
});

test("price-history loader returns the latest snapshots in chronological order", async () => {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_cards (id TEXT PRIMARY KEY)
  `);
  await database.execute(`
    CREATE TABLE poketrace_tcg_market_prices (
      card_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      market_price REAL NOT NULL,
      currency TEXT,
      source_updated_at TEXT
    )
  `);
  await database.execute({
    sql: "INSERT INTO poketrace_cards (id) VALUES (?)",
    args: [cardId],
  });

  for (const [date, price] of [
    ["2026-09-15", 400],
    ["2026-09-16", 410],
    ["2026-09-17", 420],
  ] as const) {
    await database.execute({
      sql: `
        INSERT INTO poketrace_tcg_market_prices
          (card_id, recorded_at, market_price, currency, source_updated_at)
        VALUES (?, ?, ?, 'USD', ?)
      `,
      args: [cardId, date, price, `${date}T08:00:00.000Z`],
    });
  }

  const history = await loadPokeTracePriceHistory(
    cardId,
    2,
    database,
    Promise.resolve(),
  );

  assert.deepEqual(
    history?.snapshots.map((snapshot) => [
      snapshot.recordedAt,
      snapshot.prices,
    ]),
    [
      ["2026-09-16", { tcgplayer: { NEAR_MINT: { avg: 410 } } }],
      ["2026-09-17", { tcgplayer: { NEAR_MINT: { avg: 420 } } }],
    ],
  );
  database.close();
});

test("GET /api/cards/:id/price-history returns PokeTrace price snapshots", async () => {
  const app = express();
  app.get(
    "/api/cards/:id/price-history",
    createPokeTracePriceHistoryHandler({
      loadHistory: async (requestedCardId, days) => {
        assert.equal(requestedCardId, cardId);
        assert.equal(days, 14);
        return {
          cardId: requestedCardId,
          days,
          snapshots: [
            {
              recordedAt: "2026-09-17",
              currency: "USD",
              prices: {
                tcgplayer: { NEAR_MINT: { avg: 420 } },
              },
              sourceUpdatedAt: "2026-09-17T08:00:00.000Z",
            },
          ],
        };
      },
      reportError: () => {
        assert.fail("The successful request must not be logged as an error");
      },
    }),
  );

  const response = await requestFromTestServer(
    app,
    `/api/cards/${cardId}/price-history?days=14`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    cardId,
    days: 14,
    snapshots: [
      {
        recordedAt: "2026-09-17",
        currency: "USD",
        prices: {
          tcgplayer: { NEAR_MINT: { avg: 420 } },
        },
        sourceUpdatedAt: "2026-09-17T08:00:00.000Z",
      },
    ],
  });
});

test("price history validates the card ID and days before loading", async () => {
  const app = express();
  let calls = 0;
  app.get(
    "/api/cards/:id/price-history",
    createPokeTracePriceHistoryHandler({
      loadHistory: async () => {
        calls += 1;
        return null;
      },
    }),
  );

  const invalidId = await requestFromTestServer(
    app,
    "/api/cards/not-a-card/price-history",
  );
  const invalidDays = await requestFromTestServer(
    app,
    `/api/cards/${cardId}/price-history?days=31`,
  );

  assert.equal(invalidId.status, 400);
  assert.equal(invalidDays.status, 400);
  assert.equal(calls, 0);
});

test("price history returns 404 for a missing PokeTrace card", async () => {
  const app = express();
  app.get(
    "/api/cards/:id/price-history",
    createPokeTracePriceHistoryHandler({
      loadHistory: async () => null,
    }),
  );

  const response = await requestFromTestServer(
    app,
    `/api/cards/${cardId}/price-history`,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Card not found" });
});

test("GET /api/cards/:id/market-price-history returns available provider series", async () => {
  const app = express();
  app.get(
    "/api/cards/:id/market-price-history",
    createMarketPriceHistoryHandler({
      loadHistory: async (requestedCardId) => ({
        cardId: requestedCardId,
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
      }),
    }),
  );

  const response = await requestFromTestServer(
    app,
    `/api/cards/${cardId}/market-price-history`,
  );

  assert.equal(response.status, 200);
  const history = (await response.json()) as {
    series: { tcgplayer: unknown[]; ebay: unknown[] };
  };
  assert.equal(history.series.tcgplayer.length, 1);
  assert.equal(history.series.ebay.length, 0);
});
