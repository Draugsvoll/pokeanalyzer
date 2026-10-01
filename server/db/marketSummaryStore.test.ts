import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  MARKET_SUMMARY_UPSERT_SQL,
  parseStoredMarketSummaryRows,
} from "./marketSummaryStore.js";
import { PRIMARY_DATABASE_MIGRATIONS } from "./primaryDatabaseMigrations.js";

const marketSummary = {
  generatedAt: "2026-07-29T12:00:00.000Z",
  marketTone: {
    headline: "Markets were mixed",
    label: "mixed",
  },
  marketOverview: ["Modern products remained stable."],
  keyThemesAndChanges: [],
  liquidity: [],
  marketDrivers: [],
  segmentSummary: [],
  collectorOutlook: null,
  whatToWatch: [],
};

test("market summary storage keeps one standalone JSON document", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    for (const migration of PRIMARY_DATABASE_MIGRATIONS) {
      await client.executeMultiple(migration.sql);
    }

    await client.execute({
      sql: MARKET_SUMMARY_UPSERT_SQL,
      args: [JSON.stringify(marketSummary), marketSummary.generatedAt],
    });

    const updated = {
      ...marketSummary,
      generatedAt: "2026-07-30T12:00:00.000Z",
    };
    await client.execute({
      sql: MARKET_SUMMARY_UPSERT_SQL,
      args: [JSON.stringify(updated), updated.generatedAt],
    });

    const result = await client.execute(
      "SELECT payload_json, generated_at FROM market_summary_content",
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.generated_at, updated.generatedAt);
    assert.equal(
      JSON.parse(String(result.rows[0]?.payload_json)).generatedAt,
      updated.generatedAt,
    );
  } finally {
    client.close();
  }
});

test("stored market summary JSON is parsed independently", () => {
  assert.deepEqual(
    parseStoredMarketSummaryRows([
      { payload_json: JSON.stringify(marketSummary) },
    ]),
    { marketSummary },
  );
  assert.deepEqual(parseStoredMarketSummaryRows([]), {
    marketSummary: null,
  });
});
