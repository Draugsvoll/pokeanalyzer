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
  } finally {
    database.close();
  }
});
