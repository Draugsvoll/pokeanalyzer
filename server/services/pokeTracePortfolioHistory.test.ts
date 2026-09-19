import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { loadPokeTracePortfolioHistory } from "./pokeTracePortfolioHistory.js";

test("portfolio hydration selects TCG market snapshots for 1d, 7d, and 30d", async () => {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_tcg_market_prices (
      card_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      market_price REAL NOT NULL,
      source_updated_at TEXT,
      PRIMARY KEY (card_id, recorded_at)
    )
  `);

  const rows = [
    ["card-a", "2026-06-17", 70],
    ["card-a", "2026-08-17", 75],
    ["card-a", "2026-08-18", 80],
    ["card-a", "2026-09-09", 90],
    ["card-a", "2026-09-11", 92],
    ["card-a", "2026-09-15", 95],
    ["card-a", "2026-09-16", 98],
    ["card-a", "2026-09-17", 100],
    ["card-b", "2026-09-08", 40],
    ["card-b", "2026-09-17", 50],
  ] as const;
  await database.batch(
    rows.map(([cardId, recordedAt, marketPrice]) => ({
      sql: `
        INSERT INTO poketrace_tcg_market_prices
          (card_id, recorded_at, market_price, source_updated_at)
        VALUES (?, ?, ?, ?)
      `,
      args: [cardId, recordedAt, marketPrice, `${recordedAt}T08:00:00.000Z`],
    })),
    "write",
  );

  const history = await loadPokeTracePortfolioHistory(database, [
    "card-a",
    "card-b",
    "missing-card",
  ]);

  assert.deepEqual(history.get("card-a"), {
    "1d": {
      recordedAt: "2026-09-16",
      marketPrice: 98,
      sourceUpdatedAt: "2026-09-16T08:00:00.000Z",
    },
    "7d": {
      recordedAt: "2026-09-09",
      marketPrice: 90,
      sourceUpdatedAt: "2026-09-09T08:00:00.000Z",
    },
    "30d": {
      recordedAt: "2026-08-18",
      marketPrice: 80,
      sourceUpdatedAt: "2026-08-18T08:00:00.000Z",
    },
  });
  assert.deepEqual(history.get("card-b"), {
    "1d": {
      recordedAt: "2026-09-17",
      marketPrice: 50,
      sourceUpdatedAt: "2026-09-17T08:00:00.000Z",
    },
  });
  assert.equal(history.has("missing-card"), false);
  database.close();
});

test("portfolio hydration uses exact, older, then newer snapshots inside the narrow windows", async () => {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_tcg_market_prices (
      card_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      market_price REAL NOT NULL,
      source_updated_at TEXT,
      PRIMARY KEY (card_id, recorded_at)
    )
  `);
  await database.batch(
    [
      ["card-a", "2026-08-16", 70],
      ["card-a", "2026-08-17", 72],
      ["card-a", "2026-08-19", 74],
      ["card-a", "2026-09-08", 80],
      ["card-a", "2026-09-09", 82],
      ["card-a", "2026-09-11", 84],
      ["card-a", "2026-09-14", 90],
      ["card-a", "2026-09-15", 92],
      ["card-a", "2026-09-17", 100],
    ].map(([cardId, recordedAt, marketPrice]) => ({
      sql: `
        INSERT INTO poketrace_tcg_market_prices
          (card_id, recorded_at, market_price)
        VALUES (?, ?, ?)
      `,
      args: [cardId, recordedAt, marketPrice],
    })),
    "write",
  );

  const history = await loadPokeTracePortfolioHistory(database, ["card-a"]);
  assert.deepEqual(history.get("card-a"), {
    "1d": {
      recordedAt: "2026-09-15",
      marketPrice: 92,
      sourceUpdatedAt: null,
    },
    "7d": {
      recordedAt: "2026-09-09",
      marketPrice: 82,
      sourceUpdatedAt: null,
    },
    "30d": {
      recordedAt: "2026-08-17",
      marketPrice: 72,
      sourceUpdatedAt: null,
    },
  });
  database.close();
});
