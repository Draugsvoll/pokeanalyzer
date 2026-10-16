import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { MARKET_CATEGORY_DEFINITIONS } from "../config/marketCategories.js";
import {
  findMostSold,
  findPriceMovers,
  normalizeMostSoldOptions,
  normalizePriceMoversOptions,
} from "./marketCategoryQueries.js";

async function createDatabase() {
  const database = createClient({ url: "file::memory:" });
  await database.batch(
    [
      `CREATE TABLE poketrace_cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        card_number TEXT,
        set_name TEXT,
        rarity TEXT,
        variant TEXT,
        image_url TEXT,
        raw_json TEXT NOT NULL DEFAULT '{}',
        tcg_market_comparisons TEXT NOT NULL DEFAULT '{}'
      )`,
      `CREATE TABLE poketrace_tcg_market_prices (
        card_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        market_price REAL NOT NULL,
        currency TEXT,
        PRIMARY KEY (card_id, recorded_at)
      )`,
      `CREATE TABLE poketrace_market_snapshots (
        card_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        currency TEXT,
        tcg TEXT,
        ebay TEXT,
        PRIMARY KEY (card_id, recorded_at)
      )`,
    ],
    "write",
  );
  await database.batch(
    [
      ["a", "Alpha", "1", "Test", "Rare", "Normal", "a.jpg"],
      ["b", "Beta", "2", "Test", "Rare", "Normal", "b.jpg"],
      ["c", "Cheap", "3", "Test", "Common", "Normal", "c.jpg"],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_cards
        (id, name, card_number, set_name, rarity, variant, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args,
    })),
    "write",
  );
  return database;
}

async function seedCachedMover(
  database: Awaited<ReturnType<typeof createDatabase>>,
  id: string,
  options: {
    currentPrice?: number;
    comparisonPrice?: number | null;
    currentSales?: number | string | null;
    previousSales?: number | string | null;
    currentDate?: string;
    previousDate?: string;
    asOf?: string;
  } = {},
) {
  const {
    currentPrice = 30,
    comparisonPrice = 20,
    currentSales = 200,
    previousSales = 198,
    currentDate = "2026-10-15",
    previousDate = "2026-10-13",
    asOf = currentDate,
  } = options;
  await database.execute({
    sql: `INSERT OR REPLACE INTO poketrace_cards
      (id, name, raw_json, tcg_market_comparisons) VALUES (?, ?, ?, ?)`,
    args: [
      id,
      id,
      JSON.stringify({
        currency: "USD",
        prices: {
          tcgplayer: {
            NEAR_MINT: { avg: currentPrice, saleCount: currentSales },
          },
        },
      }),
      JSON.stringify({
        asOf,
        comparisons: {
          "1d":
            comparisonPrice === null
              ? null
              : {
                  targetDate: "2026-10-14",
                  recordedAt: "2026-10-13",
                  marketPrice: comparisonPrice,
                  sourceUpdatedAt: null,
                },
          "7d": null,
          "30d": null,
        },
      }),
    ],
  });
  await database.batch(
    [
      [previousDate, previousSales, 1],
      [currentDate, currentSales, 10_000],
    ].map(([date, saleCount, otherSales]) => ({
      sql: `INSERT OR REPLACE INTO poketrace_market_snapshots
      (card_id, recorded_at, currency, tcg) VALUES (?, ?, 'USD', ?)`,
      args: [
        id,
        date,
        JSON.stringify({
          // Deliberately unrelated prices: the ranking must use the cached 1d label.
          NEAR_MINT: { avg: date === currentDate ? 100 : 500, saleCount },
          LIGHTLY_PLAYED: { avg: 500, saleCount: otherSales },
        }),
      ],
    })),
    "write",
  );
}

test("daily categories rank cached 1d changes with Near Mint sales qualification", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-16T12:00:00Z"),
  });
  const database = await createDatabase();
  t.after(() => database.close());
  await seedCachedMover(database, "gain-50");
  await seedCachedMover(database, "gain-100", { currentPrice: 40 });
  await seedCachedMover(database, "lose-20", {
    currentPrice: 20,
    comparisonPrice: 25,
  });
  await seedCachedMover(database, "lose-50", {
    currentPrice: 20,
    comparisonPrice: 40,
  });
  await seedCachedMover(database, "under-200", {
    currentSales: 199,
    previousSales: 197,
  });
  await seedCachedMover(database, "only-one-new-sale", { previousSales: 199 });
  await seedCachedMover(database, "declining-sales", { previousSales: 201 });
  await seedCachedMover(database, "missing-previous-sales", {
    previousSales: null,
  });
  await seedCachedMover(database, "missing-current-sales", {
    currentSales: null,
  });
  await seedCachedMover(database, "invalid-sales", {
    previousSales: "unknown",
  });
  await seedCachedMover(database, "cheap-current", {
    currentPrice: 19.99,
    comparisonPrice: 40,
  });
  await seedCachedMover(database, "cheap-comparison", {
    comparisonPrice: 19.99,
  });
  await seedCachedMover(database, "missing-comparison", {
    comparisonPrice: null,
  });
  await seedCachedMover(database, "stale-cache", { asOf: "2026-10-13" });
  await seedCachedMover(database, "unchanged", { currentPrice: 20 });

  for (const definition of MARKET_CATEGORY_DEFINITIONS) {
    if (definition.query !== "priceMovers") continue;
    const result = await findPriceMovers(database, definition.parameters);
    assert.equal(result.status, "ready");
    assert.equal(result.parameters.periodDays, 1);
    assert.equal(result.currentSnapshotDate, "2026-10-15");
    assert.equal(result.comparisonSnapshotDate, "2026-10-13");
    assert.deepEqual(
      result.items.map((item) => [
        item.cardId,
        item.changePercent,
        item.saleCount,
      ]),
      definition.parameters.direction === "gainers"
        ? [
            ["gain-100", 100, 200],
            ["gain-50", 50, 200],
          ]
        : [
            ["lose-50", -50, 200],
            ["lose-20", -20, 200],
          ],
    );
  }
});

test("daily sales snapshots allow six days of age, exclude future dates, and require both dates", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-16T23:59:59Z"),
  });
  const database = await createDatabase();
  t.after(() => database.close());
  await seedCachedMover(database, "boundary", { previousDate: "2026-10-10" });
  await database.execute({
    sql: `INSERT INTO poketrace_market_snapshots (card_id, recorded_at, tcg)
      VALUES ('future', '2026-10-17', '{"NEAR_MINT":{"saleCount":999}}')`,
  });
  const options = {
    useCachedOneDayComparison: true,
    minimumSales: 200,
    minimumSalesIncrease: 2,
  };
  const ready = await findPriceMovers(database, options);
  assert.equal(ready.comparisonSnapshotDate, "2026-10-10");
  assert.deepEqual(
    ready.items.map((item) => item.cardId),
    ["boundary"],
  );
  await database.execute(
    "UPDATE poketrace_market_snapshots SET recorded_at = '2026-10-09' WHERE recorded_at = '2026-10-10'",
  );
  const missing = await findPriceMovers(database, options);
  assert.equal(missing.status, "insufficient_history");
  assert.equal(missing.currentSnapshotDate, "2026-10-15");
  assert.equal(missing.comparisonSnapshotDate, null);
  assert.deepEqual(missing.items, []);
});

test("daily ranking uses only the newest two TCG dates and keeps the top twelve", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-16T12:00:00Z"),
  });
  const database = await createDatabase();
  t.after(() => database.close());
  for (let i = 1; i <= 15; i++) {
    await seedCachedMover(database, `gain-${i}`, { currentPrice: 20 + i });
  }
  await seedCachedMover(database, "older-pair", {
    currentPrice: 1000,
    previousDate: "2026-10-12",
  });
  await database.execute(`INSERT INTO poketrace_market_snapshots (card_id, recorded_at, ebay)
    VALUES ('ebay-only', '2026-10-16', '{"NEAR_MINT":{"saleCount":999}}')`);
  const definition = MARKET_CATEGORY_DEFINITIONS.find(
    (c) => c.query === "priceMovers" && c.parameters.direction === "gainers",
  )!;
  assert.equal(definition.query, "priceMovers");
  const result = await findPriceMovers(database, definition.parameters);
  assert.deepEqual(
    result.items.map((item) => item.cardId),
    Array.from({ length: 12 }, (_, i) => `gain-${15 - i}`),
  );
});

test("finds customizable TCGPlayer Near Mint price gainers", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      ["a", "2026-09-21", 20, "USD"],
      ["a", "2026-09-22", 30, "USD"],
      ["b", "2026-09-21", 50, "USD"],
      ["b", "2026-09-22", 60, "USD"],
      ["c", "2026-09-21", 1, "USD"],
      ["c", "2026-09-22", 10, "USD"],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_tcg_market_prices
        (card_id, recorded_at, market_price, currency) VALUES (?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const result = await findPriceMovers(database, {
    limit: 1,
    minimumPrice: 20,
    periodDays: 1,
    sortBy: "percentage",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.currentSnapshotDate, "2026-09-22");
  assert.equal(result.comparisonSnapshotDate, "2026-09-21");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.name, "Alpha");
  assert.equal(result.items[0]?.changePercent, 50);
  database.close();
});

test("finds and ranks TCGPlayer Near Mint price losers", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      ["a", "2026-09-21", 40, "USD"],
      ["a", "2026-09-22", 30, "USD"],
      ["b", "2026-09-21", 100, "USD"],
      ["b", "2026-09-22", 60, "USD"],
      ["c", "2026-09-21", 20, "USD"],
      ["c", "2026-09-22", 30, "USD"],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_tcg_market_prices
        (card_id, recorded_at, market_price, currency) VALUES (?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const result = await findPriceMovers(database, {
    direction: "losers",
    minimumPrice: 20,
  });

  assert.deepEqual(
    result.items.map((item) => [item.name, item.changePercent]),
    [
      ["Beta", -40],
      ["Alpha", -25],
    ],
  );
  database.close();
});

test("excludes unchanged prices from both gainers and losers", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      ["a", "2026-09-21", 20, "USD"],
      ["a", "2026-09-22", 20, "USD"],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_tcg_market_prices
        (card_id, recorded_at, market_price, currency) VALUES (?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const gainers = await findPriceMovers(database, { minimumPrice: 0 });
  const losers = await findPriceMovers(database, {
    direction: "losers",
    minimumPrice: 0,
  });

  assert.deepEqual(gainers.items, []);
  assert.deepEqual(losers.items, []);
  database.close();
});

test("requires the configured current sales and sales increase for both sources", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      ["a", "2026-09-21", 20, "USD"],
      ["a", "2026-09-22", 30, "USD"],
      ["b", "2026-09-21", 20, "USD"],
      ["b", "2026-09-22", 40, "USD"],
      ["c", "2026-09-21", 20, "USD"],
      ["c", "2026-09-22", 50, "USD"],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_tcg_market_prices
        (card_id, recorded_at, market_price, currency) VALUES (?, ?, ?, ?)`,
      args,
    })),
    "write",
  );
  await database.batch(
    [
      [
        "a",
        "2026-09-21",
        '{"NEAR_MINT":{"saleCount":20}}',
        '{"NEAR_MINT":{"avg":20,"saleCount":20}}',
      ],
      [
        "a",
        "2026-09-22",
        '{"NEAR_MINT":{"saleCount":21}}',
        '{"NEAR_MINT":{"avg":30,"saleCount":21}}',
      ],
      [
        "b",
        "2026-09-21",
        '{"NEAR_MINT":{"saleCount":25}}',
        '{"NEAR_MINT":{"avg":20,"saleCount":25}}',
      ],
      [
        "b",
        "2026-09-22",
        '{"NEAR_MINT":{"saleCount":25}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":25}}',
      ],
      [
        "c",
        "2026-09-21",
        '{"NEAR_MINT":{"saleCount":19}}',
        '{"NEAR_MINT":{"avg":20,"saleCount":19}}',
      ],
      [
        "c",
        "2026-09-22",
        '{"NEAR_MINT":{"saleCount":20}}',
        '{"NEAR_MINT":{"avg":50,"saleCount":20}}',
      ],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_market_snapshots
        (card_id, recorded_at, tcg, ebay) VALUES (?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const options = {
    minimumPrice: 20,
    minimumSales: 21,
    minimumSalesIncrease: 1,
  };
  const tcgplayer = await findPriceMovers(database, options);
  const ebay = await findPriceMovers(database, {
    ...options,
    source: "ebay",
  });

  assert.deepEqual(
    tcgplayer.items.map((item) => item.name),
    ["Alpha"],
  );
  assert.deepEqual(
    ebay.items.map((item) => item.name),
    ["Alpha"],
  );
  assert.equal(tcgplayer.items[0]?.saleCount, 21);
  assert.equal(ebay.items[0]?.saleCount, 21);
  database.close();
});

test("ranks new sales with configurable source, condition, and period", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      [
        "a",
        "2026-09-20",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":8},"LIGHTLY_PLAYED":{"avg":20,"saleCount":4},"HEAVILY_PLAYED":{"avg":10,"saleCount":2}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":3},"LIGHTLY_PLAYED":{"avg":25,"saleCount":1}}',
      ],
      [
        "a",
        "2026-09-21",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":10},"LIGHTLY_PLAYED":{"avg":20,"saleCount":5},"HEAVILY_PLAYED":{"avg":10,"saleCount":2}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":5},"LIGHTLY_PLAYED":{"avg":25,"saleCount":1}}',
      ],
      [
        "a",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":12},"LIGHTLY_PLAYED":{"avg":20,"saleCount":8},"HEAVILY_PLAYED":{"avg":10,"saleCount":2}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":10},"LIGHTLY_PLAYED":{"avg":25,"saleCount":2}}',
      ],
      [
        "b",
        "2026-09-20",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":18},"LIGHTLY_PLAYED":{"avg":15,"saleCount":9},"HEAVILY_PLAYED":{"avg":10,"saleCount":0}}',
        '{"NEAR_MINT":{"avg":35,"saleCount":8},"LIGHTLY_PLAYED":{"avg":20,"saleCount":4}}',
      ],
      [
        "b",
        "2026-09-21",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":20},"LIGHTLY_PLAYED":{"avg":15,"saleCount":10},"HEAVILY_PLAYED":{"avg":10,"saleCount":0}}',
        '{"NEAR_MINT":{"avg":35,"saleCount":10},"LIGHTLY_PLAYED":{"avg":20,"saleCount":5}}',
      ],
      [
        "b",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":21},"LIGHTLY_PLAYED":{"avg":15,"saleCount":15},"HEAVILY_PLAYED":{"avg":10,"saleCount":1}}',
        '{"NEAR_MINT":{"avg":35,"saleCount":12},"LIGHTLY_PLAYED":{"avg":20,"saleCount":5}}',
      ],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_market_snapshots
        (card_id, recorded_at, currency, tcg, ebay) VALUES (?, ?, ?, ?, ?)`,
      args,
    })),
    "write",
  );
  await database.execute({
    sql: `UPDATE poketrace_cards
      SET tcg_market_comparisons = ?
      WHERE id = 'b'`,
    args: [
      JSON.stringify({
        asOf: "2026-09-22",
        comparisons: {
          "1d": null,
          "7d": {
            marketPrice: 22,
            recordedAt: "2026-09-15",
            sourceUpdatedAt: null,
            targetDate: "2026-09-15",
          },
          "30d": null,
        },
      }),
    ],
  });

  const allTcgConditions = await findMostSold(database);
  const allEbayConditions = await findMostSold(database, { source: "ebay" });
  const nearMintOnly = await findMostSold(database, {
    condition: "NEAR_MINT",
  });
  const twoDays = await findMostSold(database, { periodDays: 2 });

  assert.deepEqual(
    allTcgConditions.items.map((item) => [item.name, item.newSales]),
    [
      ["Beta", 7],
      ["Alpha", 5],
    ],
  );
  assert.deepEqual(allTcgConditions.items[0]?.priceSnapshots, {
    "1d": null,
    "7d": 22,
    "30d": null,
  });
  assert.equal(allEbayConditions.items[0]?.priceSnapshots, undefined);
  assert.deepEqual(
    allEbayConditions.items.map((item) => [item.name, item.newSales]),
    [
      ["Alpha", 6],
      ["Beta", 2],
    ],
  );
  assert.deepEqual(
    nearMintOnly.items.map((item) => [item.name, item.newSales]),
    [
      ["Alpha", 2],
      ["Beta", 1],
    ],
  );
  assert.equal(nearMintOnly.items[0]?.currentPrice, 30);
  assert.equal(twoDays.comparisonSnapshotDate, "2026-09-20");
  assert.equal(twoDays.items[0]?.newSales, 10);
  database.close();
});

test("calculates new sales from the combined condition totals", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      [
        "a",
        "2026-09-21",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":10},"LIGHTLY_PLAYED":{"avg":20,"saleCount":10}}',
      ],
      [
        "a",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":15},"LIGHTLY_PLAYED":{"avg":20,"saleCount":6}}',
      ],
      [
        "b",
        "2026-09-21",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":10},"LIGHTLY_PLAYED":{"avg":15,"saleCount":10}}',
      ],
      [
        "b",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":15},"LIGHTLY_PLAYED":{"avg":15,"saleCount":5}}',
      ],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_market_snapshots
        (card_id, recorded_at, currency, tcg) VALUES (?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const result = await findMostSold(database);

  assert.deepEqual(
    result.items.map((item) => [item.name, item.newSales]),
    [["Alpha", 1]],
  );
  database.close();
});

test("requires increasing sales across all three snapshots for both sources", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-22T12:00:00Z"),
  });
  const database = await createDatabase();
  await database.batch(
    [
      [
        "a",
        "2026-09-20",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":10}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":20}}',
      ],
      [
        "a",
        "2026-09-21",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":12}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":23}}',
      ],
      [
        "a",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":15}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":25}}',
      ],
      [
        "b",
        "2026-09-20",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":10}}',
        '{"NEAR_MINT":{"avg":35,"saleCount":20}}',
      ],
      [
        "b",
        "2026-09-21",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":9}}',
        '{"NEAR_MINT":{"avg":35,"saleCount":19}}',
      ],
      [
        "b",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":20}}',
        '{"NEAR_MINT":{"avg":35,"saleCount":30}}',
      ],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_market_snapshots
        (card_id, recorded_at, currency, tcg, ebay) VALUES (?, ?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const tcgplayer = await findMostSold(database, {
    requireThreeSnapshotIncrease: true,
  });
  const ebay = await findMostSold(database, {
    requireThreeSnapshotIncrease: true,
    source: "ebay",
  });

  assert.equal(tcgplayer.parameters.periodDays, 2);
  assert.equal(tcgplayer.comparisonSnapshotDate, "2026-09-20");
  assert.deepEqual(
    tcgplayer.items.map((item) => [item.name, item.newSales]),
    [["Alpha", 5]],
  );
  assert.deepEqual(
    ebay.items.map((item) => [item.name, item.newSales]),
    [["Alpha", 5]],
  );
  database.close();
});

test("requires three source-specific snapshot dates for the sales trend", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-23T12:00:00Z"),
  });
  const database = await createDatabase();
  await database.batch(
    [
      [
        "a",
        "2026-09-20",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":10}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":20}}',
      ],
      [
        "a",
        "2026-09-21",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":12}}',
        null,
      ],
      [
        "a",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":15}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":25}}',
      ],
      [
        "a",
        "2026-09-23",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":18}}',
        null,
      ],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_market_snapshots
        (card_id, recorded_at, currency, tcg, ebay) VALUES (?, ?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const result = await findMostSold(database, {
    requireThreeSnapshotIncrease: true,
    source: "ebay",
  });

  assert.equal(result.currentSnapshotDate, "2026-09-22");
  assert.equal(result.comparisonSnapshotDate, null);
  assert.equal(result.status, "insufficient_history");
  assert.deepEqual(result.items, []);
  database.close();
});

for (const scenario of [
  { name: "every-other-day snapshots", days: [12, 14, 16], oldest: 12 },
  { name: "only the newest three dates", days: [9, 12, 14, 16], oldest: 12 },
  { name: "the inclusive ten-day boundary", days: [6, 12, 16], oldest: 6 },
  { name: "an oldest date over ten days old", days: [5, 12, 16], oldest: null },
  { name: "history stale relative to today", days: [4, 5, 6], oldest: null },
  { name: "future dates excluded", days: [12, 14, 16, 17], oldest: 12 },
  { name: "multiple cards but only two dates", days: [14, 16], oldest: null },
]) {
  test(`selects recent sales snapshots: ${scenario.name}`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-10-16T23:59:59Z"),
    });
    const database = await createDatabase();
    t.after(() => database.close());
    const date = (day: number) => `2026-10-${String(day).padStart(2, "0")}`;
    await database.batch(
      scenario.days.flatMap((day) =>
        ["a", "b"].map((cardId) => {
          const prices = JSON.stringify({
            NEAR_MINT: { avg: 30, saleCount: day },
          });
          return {
            sql: `INSERT INTO poketrace_market_snapshots
              (card_id, recorded_at, tcg, ebay) VALUES (?, ?, ?, ?)`,
            args: [cardId, date(day), prices, prices],
          };
        }),
      ),
      "write",
    );

    for (const source of ["tcgplayer", "ebay"] as const) {
      const result = await findMostSold(database, {
        requireThreeSnapshotIncrease: true,
        source,
      });
      if (scenario.oldest === null) {
        assert.equal(result.status, "insufficient_history");
        assert.deepEqual(result.items, []);
      } else {
        assert.equal(result.status, "ready");
        assert.equal(result.currentSnapshotDate, date(16));
        assert.equal(result.comparisonSnapshotDate, date(scenario.oldest));
        assert.equal(result.parameters.periodDays, 16 - scenario.oldest);
        assert.deepEqual(
          result.items.map((item) => [item.cardId, item.newSales]),
          [
            ["a", 16 - scenario.oldest],
            ["b", 16 - scenario.oldest],
          ],
        );
      }
    }
  });
}

test("selects each marketplace's dates and excludes cards missing a selected snapshot", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-16T12:00:00Z"),
  });
  const database = await createDatabase();
  t.after(() => database.close());
  await database.batch(
    [10, 12, 14, 16].flatMap((day) =>
      (day === 14 ? ["a"] : ["a", "b"]).map((cardId) => {
        const prices = JSON.stringify({
          NEAR_MINT: { avg: 30, saleCount: day * (cardId === "a" ? 1 : 2) },
        });
        return {
          sql: `INSERT INTO poketrace_market_snapshots
            (card_id, recorded_at, tcg, ebay) VALUES (?, ?, ?, ?)`,
          args: [cardId, `2026-10-${day}`, prices, day === 14 ? null : prices],
        };
      }),
    ),
    "write",
  );

  const tcg = await findMostSold(database, {
    requireThreeSnapshotIncrease: true,
  });
  const ebay = await findMostSold(database, {
    requireThreeSnapshotIncrease: true,
    source: "ebay",
  });
  assert.equal(tcg.comparisonSnapshotDate, "2026-10-12");
  assert.deepEqual(
    tcg.items.map((item) => [item.cardId, item.newSales]),
    [["a", 4]],
  );
  assert.equal(ebay.comparisonSnapshotDate, "2026-10-10");
  assert.deepEqual(
    ebay.items.map((item) => [item.cardId, item.newSales]),
    [
      ["b", 12],
      ["a", 6],
    ],
  );
});

test("uses condition snapshots for other customizable conditions", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      ["a", "2026-09-20", "USD", '{"LIGHTLY_PLAYED":{"avg":20}}'],
      [
        "a",
        "2026-09-22",
        "USD",
        '{"LIGHTLY_PLAYED":{"avg":35,"saleCount":12}}',
      ],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_market_snapshots
        (card_id, recorded_at, currency, tcg) VALUES (?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const result = await findPriceMovers(database, {
    condition: "LIGHTLY_PLAYED",
    minimumPrice: 10,
    periodDays: 2,
    source: "tcgplayer",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.items[0]?.currentPrice, 35);
  assert.equal(result.items[0]?.previousPrice, 20);
  assert.equal(result.items[0]?.saleCount, 12);
  database.close();
});

test("rejects unsafe or unsupported parameters", () => {
  for (const options of [
    { source: "ebay" as const },
    { condition: "LIGHTLY_PLAYED" as const },
    { periodDays: 7 },
  ]) {
    assert.throws(
      () =>
        normalizePriceMoversOptions({
          ...options,
          useCachedOneDayComparison: true,
        }),
      /Cached 1d comparisons/,
    );
  }
  assert.throws(
    () => normalizePriceMoversOptions({ periodDays: 0 }),
    /periodDays/,
  );
  assert.throws(
    () =>
      normalizePriceMoversOptions({
        condition: "MINT" as "NEAR_MINT",
      }),
    /condition/,
  );
  assert.throws(
    () => normalizePriceMoversOptions({ minimumSales: -1 }),
    /minimumSales/,
  );
  assert.throws(
    () => normalizePriceMoversOptions({ minimumSalesIncrease: -1 }),
    /minimumSalesIncrease/,
  );
  assert.throws(
    () => normalizeMostSoldOptions({ periodDays: 0 }),
    /periodDays/,
  );
  assert.throws(
    () =>
      normalizeMostSoldOptions({
        condition: "MINT" as "NEAR_MINT",
      }),
    /condition/,
  );
});

test("reports a ready category when history exists but filters match nothing", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      ["a", "2026-09-21", 20, "USD"],
      ["a", "2026-09-22", 30, "USD"],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_tcg_market_prices
        (card_id, recorded_at, market_price, currency) VALUES (?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const result = await findPriceMovers(database, { minimumPrice: 1_000 });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.items, []);
  database.close();
});
