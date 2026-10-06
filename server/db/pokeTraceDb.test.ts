import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  migratePokeTraceDatabase,
  shouldRunRuntimePokeTraceMigrations,
} from "./pokeTraceDb.js";

test("production and Railway delegate migrations to deployment", () => {
  assert.equal(
    shouldRunRuntimePokeTraceMigrations({ NODE_ENV: "production" }),
    false,
  );
  assert.equal(
    shouldRunRuntimePokeTraceMigrations({
      NODE_ENV: "development",
      RAILWAY_ENVIRONMENT_ID: "environment-id",
    }),
    false,
  );
  assert.equal(
    shouldRunRuntimePokeTraceMigrations({ NODE_ENV: "development" }),
    true,
  );
});

test("PokeTrace deployment migrations are complete and idempotent", async () => {
  const database = createClient({ url: ":memory:" });

  try {
    await migratePokeTraceDatabase(database);
    await migratePokeTraceDatabase(database);

    const tables = await database.execute(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'poketrace_%'
      ORDER BY name
    `);
    assert.deepEqual(
      tables.rows.map((row) => row.name),
      [
        "poketrace_cards",
        "poketrace_catalog_payloads",
        "poketrace_filter_options",
        "poketrace_import_progress",
        "poketrace_job_locks",
        "poketrace_market_categories",
        "poketrace_market_snapshots",
        "poketrace_sealed_catalog_payloads",
        "poketrace_sealed_import_progress",
        "poketrace_sealed_products",
        "poketrace_sealed_tcg_market_prices",
        "poketrace_tcg_market_prices",
      ],
    );

    const cardColumns = await database.execute(
      "PRAGMA table_info(poketrace_cards)",
    );
    const names = new Set(cardColumns.rows.map((row) => row.name));
    for (const required of [
      "saved_responses",
      "price_refreshed_at",
      "price_refresh_retry_at",
      "price_refresh_failures",
      "tcg_market_comparisons",
      "market_price_history",
      "market_price_history_fetched_at",
    ]) {
      assert.equal(names.has(required), true, `Missing ${required}`);
    }

    const sealedColumns = await database.execute(
      "PRAGMA table_info(poketrace_sealed_products)",
    );
    const sealedNames = new Set(sealedColumns.rows.map((row) => row.name));
    for (const required of [
      "id",
      "name",
      "set_name",
      "product_family",
      "variant",
      "image_url",
      "tcgplayer_id",
      "raw_json",
      "fetched_at",
      "last_seen_at",
      "last_seen_crawl_id",
      "market_price_history",
      "market_price_history_fetched_at",
    ]) {
      assert.equal(sealedNames.has(required), true, `Missing ${required}`);
    }

    const sealedProgressColumns = await database.execute(
      "PRAGMA table_info(poketrace_sealed_import_progress)",
    );
    assert.equal(
      sealedProgressColumns.rows.some((row) => row.name === "crawl_id"),
      true,
    );
    assert.equal(
      sealedProgressColumns.rows.some((row) => row.name === "finalized"),
      true,
    );
  } finally {
    database.close();
  }
});

test("PokeTrace migrations add history caching to an existing sealed table", async () => {
  const database = createClient({ url: ":memory:" });

  try {
    await database.execute(`
      CREATE TABLE poketrace_sealed_products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        set_name TEXT,
        product_family TEXT NOT NULL,
        variant TEXT,
        image_url TEXT,
        tcgplayer_id TEXT,
        raw_json TEXT NOT NULL CHECK (json_valid(raw_json)),
        fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await database.execute(`
      CREATE TABLE poketrace_sealed_import_progress (
        name TEXT PRIMARY KEY,
        next_cursor TEXT,
        imported_count INTEGER NOT NULL DEFAULT 0,
        complete INTEGER NOT NULL DEFAULT 0
      )
    `);
    await database.execute(`
      INSERT INTO poketrace_sealed_import_progress
        (name, next_cursor, imported_count, complete)
      VALUES ('legacy-complete', NULL, 10, 1)
    `);

    await migratePokeTraceDatabase(database);

    const columns = await database.execute(
      "PRAGMA table_info(poketrace_sealed_products)",
    );
    const names = new Set(columns.rows.map((row) => row.name));
    assert.equal(names.has("last_seen_crawl_id"), true);
    assert.equal(names.has("market_price_history"), true);
    assert.equal(names.has("market_price_history_fetched_at"), true);

    const progressColumns = await database.execute(
      "PRAGMA table_info(poketrace_sealed_import_progress)",
    );
    assert.equal(
      progressColumns.rows.some((row) => row.name === "crawl_id"),
      true,
    );
    assert.equal(
      progressColumns.rows.some((row) => row.name === "finalized"),
      true,
    );
    const legacyProgress = await database.execute(`
      SELECT finalized
      FROM poketrace_sealed_import_progress
      WHERE name = 'legacy-complete'
    `);
    assert.equal(Number(legacyProgress.rows[0]?.finalized), 1);
  } finally {
    database.close();
  }
});

test("PokeTrace migrations leave completed tracked crawls pending finalization", async () => {
  const database = createClient({ url: ":memory:" });

  try {
    await database.execute(`
      CREATE TABLE poketrace_sealed_import_progress (
        name TEXT PRIMARY KEY,
        next_cursor TEXT,
        imported_count INTEGER NOT NULL DEFAULT 0,
        complete INTEGER NOT NULL DEFAULT 0,
        crawl_id TEXT
      )
    `);
    await database.execute(`
      INSERT INTO poketrace_sealed_import_progress
        (name, next_cursor, imported_count, complete, crawl_id)
      VALUES ('tracked-complete', NULL, 10, 1, 'crawl-123')
    `);

    await migratePokeTraceDatabase(database);

    const progress = await database.execute(`
      SELECT finalized
      FROM poketrace_sealed_import_progress
      WHERE name = 'tracked-complete'
    `);
    assert.equal(Number(progress.rows[0]?.finalized), 0);
  } finally {
    database.close();
  }
});
