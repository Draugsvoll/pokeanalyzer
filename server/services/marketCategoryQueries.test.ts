import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  findMostSold,
  findPriceGainers,
  normalizePriceGainersOptions,
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

  const result = await findPriceGainers(database, {
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

test("ranks total sales from TCGPlayer, eBay, or both", async () => {
  const database = await createDatabase();
  await database.batch(
    [
      [
        "a",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":30,"saleCount":10},"LIGHTLY_PLAYED":{"avg":10,"saleCount":5}}',
        '{"NEAR_MINT":{"avg":40,"saleCount":7}}',
      ],
      [
        "b",
        "2026-09-22",
        "USD",
        '{"NEAR_MINT":{"avg":25,"saleCount":12}}',
        '{"NEAR_MINT":{"avg":35,"saleCount":20}}',
      ],
    ].map((args) => ({
      sql: `INSERT INTO poketrace_market_snapshots
        (card_id, recorded_at, currency, tcg, ebay) VALUES (?, ?, ?, ?, ?)`,
      args,
    })),
    "write",
  );

  const tcgplayer = await findMostSold(database, {
    minimumPrice: 20,
    source: "tcgplayer",
  });
  const ebay = await findMostSold(database, {
    minimumPrice: 20,
    source: "ebay",
  });
  const both = await findMostSold(database, {
    minimumPrice: 20,
    source: "both",
  });

  assert.equal(tcgplayer.items[0]?.name, "Beta");
  assert.equal(tcgplayer.items[0]?.totalSales, 12);
  assert.equal(ebay.items[0]?.name, "Beta");
  assert.equal(ebay.items[0]?.totalSales, 20);
  assert.equal(both.items[0]?.name, "Beta");
  assert.equal(both.items[0]?.totalSales, 32);
  assert.equal(both.items[1]?.tcgplayerSales, 10);
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

  const result = await findPriceGainers(database, {
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
    () => normalizePriceGainersOptions({ periodDays: 0 }),
    /periodDays/,
  );
  assert.throws(
    () =>
      normalizePriceGainersOptions({
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

  const result = await findPriceGainers(database, { minimumPrice: 1_000 });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.items, []);
  database.close();
});
