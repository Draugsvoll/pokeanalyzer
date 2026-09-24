import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
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
        image_url TEXT
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
