import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import type { PokeTraceCard } from "./pokeTraceApi.js";
import {
  cardUpsert,
  cardAndDailyPriceUpserts,
  cardRefreshFailureUpdate,
  cardRefreshSuccessUpdate,
  cardMarketComparisonsUpdate,
  dailyTcgMarketPriceUpserts,
  expiredDailyPricesDelete,
} from "./pokeTraceStore.js";

async function createDatabase() {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      card_number TEXT,
      set_name TEXT,
      rarity TEXT,
      variant TEXT,
      image_url TEXT,
      tcgplayer_id TEXT,
      raw_json TEXT NOT NULL,
      saved_responses TEXT NOT NULL DEFAULT '{}',
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      price_refreshed_at TEXT,
      price_refresh_retry_at TEXT,
      price_refresh_failures INTEGER NOT NULL DEFAULT 0,
      tcg_market_comparisons TEXT NOT NULL DEFAULT '{}'
    )
  `);
  await database.execute(`
    CREATE TABLE poketrace_tcg_market_prices (
      card_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      market_price REAL NOT NULL,
      currency TEXT,
      source_updated_at TEXT,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (card_id, recorded_at)
    )
  `);
  return database;
}

const card: PokeTraceCard = {
  id: "019bff77-befa-771d-bab0-f5909f0a78c9",
  name: "Charizard",
  cardNumber: "004/102",
  game: "pokemon",
  market: "US",
  productType: "single",
  currency: "USD",
  lastUpdated: "2026-09-17T08:00:00.000Z",
  prices: {
    tcgplayer: {
      NEAR_MINT: { avg: 420, low: 380, high: 480 },
      LIGHTLY_PLAYED: { avg: 350 },
    },
    ebay: {
      NEAR_MINT: {
        avg: 410,
        low: 370,
        high: 470,
        saleCount: 12,
        approxSaleCount: true,
      },
      PSA_10: { avg: 5_000, saleCount: 4 },
    },
  },
};

test("stores only the TCGPlayer Near Mint market price with the refreshed card", async () => {
  const database = await createDatabase();
  await database.batch(
    cardAndDailyPriceUpserts(card, "2026-09-17", "2026-09-17T08:30:00.000Z"),
    "write",
  );

  const result = await database.execute(
    `
      SELECT card_id, recorded_at, market_price, currency, source_updated_at
      FROM poketrace_tcg_market_prices
    `,
  );
  assert.deepEqual(result.rows, [
    {
      card_id: card.id,
      recorded_at: "2026-09-17",
      market_price: 420,
      currency: "USD",
      source_updated_at: card.lastUpdated,
    },
  ]);
  const storedCard = await database.execute(
    "SELECT price_refreshed_at, price_refresh_retry_at, price_refresh_failures FROM poketrace_cards",
  );
  assert.deepEqual(storedCard.rows[0], {
    price_refreshed_at: "2026-09-17T08:30:00.000Z",
    price_refresh_retry_at: null,
    price_refresh_failures: 0,
  });
  const storedRaw = await database.execute(
    "SELECT raw_json FROM poketrace_cards",
  );
  assert.equal(
    JSON.parse(String(storedRaw.rows[0]?.raw_json)).prices.ebay.NEAR_MINT.avg,
    410,
  );
  database.close();
});

test("rerunning a date replaces its snapshot instead of duplicating it", async () => {
  const database = await createDatabase();
  await database.batch(dailyTcgMarketPriceUpserts(card, "2026-09-17"), "write");
  await database.batch(
    dailyTcgMarketPriceUpserts(
      {
        ...card,
        prices: { tcgplayer: { NEAR_MINT: { avg: 425 } } },
      },
      "2026-09-17",
    ),
    "write",
  );

  const result = await database.execute(
    "SELECT market_price FROM poketrace_tcg_market_prices",
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.market_price, 425);
  database.close();
});

test("caches exact, one-day-older, and one-day-newer comparison snapshots on the card", async () => {
  const database = await createDatabase();
  await database.execute(cardUpsert(card));
  await database.batch(
    [
      ["2026-08-19", 300],
      ["2026-08-20", 310],
      ["2026-09-09", 350],
      ["2026-09-15", 390],
      ["2026-09-16", 400],
    ].map(([date, price]) => ({
      sql: `
        INSERT INTO poketrace_tcg_market_prices
          (card_id, recorded_at, market_price, source_updated_at)
        VALUES (?, ?, ?, ?)
      `,
      args: [card.id, date, price, `${date}T08:00:00.000Z`],
    })),
    "write",
  );
  await database.execute(cardMarketComparisonsUpdate(card.id, "2026-09-17"));

  const result = await database.execute(
    "SELECT tcg_market_comparisons FROM poketrace_cards WHERE id = ?",
    [card.id],
  );
  assert.deepEqual(JSON.parse(String(result.rows[0]?.tcg_market_comparisons)), {
    asOf: "2026-09-17",
    comparisons: {
      "1d": {
        targetDate: "2026-09-16",
        recordedAt: "2026-09-16",
        marketPrice: 400,
        sourceUpdatedAt: "2026-09-16T08:00:00.000Z",
      },
      "7d": {
        targetDate: "2026-09-10",
        recordedAt: "2026-09-09",
        marketPrice: 350,
        sourceUpdatedAt: "2026-09-09T08:00:00.000Z",
      },
      "30d": {
        targetDate: "2026-08-18",
        recordedAt: "2026-08-19",
        marketPrice: 300,
        sourceUpdatedAt: "2026-08-19T08:00:00.000Z",
      },
    },
  });
  database.close();
});

test("stores null when no snapshot exists inside a comparison window", async () => {
  const database = await createDatabase();
  await database.batch(
    cardAndDailyPriceUpserts(card, "2026-09-17", "2026-09-17T08:30:00.000Z"),
    "write",
  );

  const result = await database.execute(
    "SELECT tcg_market_comparisons FROM poketrace_cards WHERE id = ?",
    [card.id],
  );
  assert.deepEqual(
    JSON.parse(String(result.rows[0]?.tcg_market_comparisons)).comparisons,
    {
      "1d": {
        targetDate: "2026-09-16",
        recordedAt: "2026-09-17",
        marketPrice: 420,
        sourceUpdatedAt: card.lastUpdated,
      },
      "7d": null,
      "30d": null,
    },
  );
  database.close();
});

test("does not create history without a TCGPlayer Near Mint market price", () => {
  assert.deepEqual(
    dailyTcgMarketPriceUpserts(
      {
        ...card,
        prices: {
          tcgplayer: { LIGHTLY_PLAYED: { avg: 350 } },
          ebay: { NEAR_MINT: { avg: 410, saleCount: 12 } },
        },
      },
      "2026-09-17",
    ),
    [],
  );
});

test("catalogue upserts preserve saved responses and price refresh state", async () => {
  const database = await createDatabase();
  const fetchedAt = "2026-09-17T08:30:00.000Z";
  const savedResponses = {
    grok: { market_analysis: { fetched_at: fetchedAt } },
  };

  await database.execute(cardUpsert(card));
  const importedCard = await database.execute({
    sql: "SELECT price_refreshed_at FROM poketrace_cards WHERE id = ?",
    args: [card.id],
  });
  assert.equal(importedCard.rows[0]?.price_refreshed_at, null);
  await database.execute(cardRefreshSuccessUpdate(card.id, fetchedAt));
  await database.execute({
    sql: "UPDATE poketrace_cards SET saved_responses = ? WHERE id = ?",
    args: [JSON.stringify(savedResponses), card.id],
  });
  await database.execute(cardUpsert({ ...card, name: "Updated Charizard" }));

  const result = await database.execute({
    sql: "SELECT name, saved_responses, price_refreshed_at FROM poketrace_cards WHERE id = ?",
    args: [card.id],
  });
  assert.equal(result.rows[0]?.name, "Updated Charizard");
  assert.equal(result.rows[0]?.price_refreshed_at, fetchedAt);
  assert.deepEqual(
    JSON.parse(String(result.rows[0]?.saved_responses)),
    savedResponses,
  );
  database.close();
});

test("rejects ambiguous snapshot dates", () => {
  assert.throws(
    () => dailyTcgMarketPriceUpserts(card, "17-09-2026"),
    /YYYY-MM-DD/,
  );
});

test("failed refreshes are deferred without changing the last successful time", async () => {
  const database = await createDatabase();
  await database.execute(cardUpsert(card));
  await database.execute(
    cardRefreshSuccessUpdate(card.id, "2026-09-17T08:30:00.000Z"),
  );
  await database.execute(
    cardRefreshFailureUpdate(card.id, 0, Date.UTC(2026, 8, 17, 9)),
  );

  const result = await database.execute(
    "SELECT price_refreshed_at, price_refresh_retry_at, price_refresh_failures FROM poketrace_cards",
  );
  assert.deepEqual(result.rows[0], {
    price_refreshed_at: "2026-09-17T08:30:00.000Z",
    price_refresh_retry_at: "2026-09-17T09:15:00.000Z",
    price_refresh_failures: 1,
  });
  database.close();
});

test("daily price retention removes only expired dates", async () => {
  const database = await createDatabase();
  await database.batch(dailyTcgMarketPriceUpserts(card, "2026-08-07"), "write");
  await database.batch(dailyTcgMarketPriceUpserts(card, "2026-08-08"), "write");
  await database.execute(expiredDailyPricesDelete("2026-09-17", 40));

  const result = await database.execute(
    "SELECT recorded_at FROM poketrace_tcg_market_prices ORDER BY recorded_at",
  );
  assert.deepEqual(result.rows, [{ recorded_at: "2026-08-08" }]);
  database.close();
});
