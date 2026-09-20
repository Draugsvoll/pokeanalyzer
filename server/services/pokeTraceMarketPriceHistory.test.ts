import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { loadMarketPriceHistory } from "./pokeTraceMarketPriceHistory.js";

const cardId = "019bff77-befa-771d-bab0-f5909f0a78c9";
const now = Date.parse("2026-09-19T12:00:00.000Z");

async function createDatabase() {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_cards (
      id TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL,
      market_price_history TEXT,
      market_price_history_fetched_at TEXT
    )
  `);
  await database.execute({
    sql: "INSERT INTO poketrace_cards (id, raw_json) VALUES (?, ?)",
    args: [cardId, JSON.stringify({ currency: "USD" })],
  });
  return database;
}

const cachedSeries = {
  tcgplayer: [
    {
      date: "2026-09-18",
      avg: 420,
      low: null,
      high: null,
      saleCount: null,
      approxSaleCount: null,
    },
  ],
};

test("stores TCGPlayer and eBay Near Mint history from one request", async () => {
  const database = await createDatabase();
  let requests = 0;
  const history = await loadMarketPriceHistory(cardId, {
    apiKey: "test-key",
    database,
    now: () => now,
    ready: Promise.resolve(),
    fetchHistory: async () => {
      requests += 1;
      return {
        data: [
          {
            date: "2026-09-18",
            source: "ebay",
            avg: 500,
            median7d: 475,
            median30d: 460,
            low: 450,
            high: 550,
            saleCount: 5,
            approxSaleCount: true,
          },
          {
            date: "2026-09-18",
            source: "tcgplayer",
            avg: 420,
            median7d: 418,
            median30d: 415,
            low: 400,
            high: 440,
            saleCount: 12,
            approxSaleCount: null,
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      };
    },
  });

  assert.equal(requests, 1);
  assert.equal(history?.series.tcgplayer?.[0].avg, 420);
  assert.equal(history?.series.ebay?.[0].avg, 500);
  assert.equal(history?.series.ebay?.[0].median7d, 475);
  const saved = await database.execute({
    sql: "SELECT market_price_history, market_price_history_fetched_at FROM poketrace_cards WHERE id = ?",
    args: [cardId],
  });
  assert.equal(
    saved.rows[0].market_price_history_fetched_at,
    "2026-09-19T12:00:00.000Z",
  );
  assert.match(String(saved.rows[0].market_price_history), /"tcgplayer"/);
  assert.match(String(saved.rows[0].market_price_history), /"ebay"/);
  database.close();
});

test("returns a cache younger than six hours without an upstream request", async () => {
  const database = await createDatabase();
  const fetchedAt = "2026-09-19T07:00:01.000Z";
  await database.execute({
    sql: `
      UPDATE poketrace_cards
      SET market_price_history = ?, market_price_history_fetched_at = ?
      WHERE id = ?
    `,
    args: [
      JSON.stringify({
        condition: "NEAR_MINT",
        period: "90d",
        currency: "USD",
        fetchedAt,
        series: cachedSeries,
      }),
      fetchedAt,
      cardId,
    ],
  });
  let requests = 0;

  const history = await loadMarketPriceHistory(cardId, {
    apiKey: "test-key",
    database,
    now: () => now,
    ready: Promise.resolve(),
    fetchHistory: async () => {
      requests += 1;
      throw new Error("must not fetch");
    },
  });

  assert.equal(requests, 0);
  assert.equal(history?.stale, false);
  assert.equal(history?.series.tcgplayer?.[0].avg, 420);
  database.close();
});

test("serves saved history as stale when a refresh fails", async () => {
  const database = await createDatabase();
  const fetchedAt = "2026-09-19T05:59:59.000Z";
  await database.execute({
    sql: `
      UPDATE poketrace_cards
      SET market_price_history = ?, market_price_history_fetched_at = ?
      WHERE id = ?
    `,
    args: [
      JSON.stringify({
        condition: "NEAR_MINT",
        period: "90d",
        currency: "USD",
        fetchedAt,
        series: cachedSeries,
      }),
      fetchedAt,
      cardId,
    ],
  });

  const history = await loadMarketPriceHistory(cardId, {
    apiKey: "test-key",
    database,
    now: () => now,
    ready: Promise.resolve(),
    fetchHistory: async () => {
      throw new Error("upstream unavailable");
    },
  });

  assert.equal(history?.stale, true);
  assert.equal(history?.series.tcgplayer?.[0].avg, 420);
  database.close();
});
