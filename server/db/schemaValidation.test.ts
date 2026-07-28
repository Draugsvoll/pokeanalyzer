import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  DAILY_SNAPSHOT_UNIQUE_KEY_SQL,
  findMissingColumns,
} from "./schemaValidationPolicy.js";

test("schema validation reports only required columns that are absent", () => {
  assert.deepEqual(
    findMissingColumns(["id", "name"], ["id", "number", "name", "raw_json"]),
    ["number", "raw_json"],
  );
});

test("schema validation accepts additional columns", () => {
  assert.deepEqual(
    findMissingColumns(
      ["id", "name", "future_column"],
      ["id", "name"],
    ),
    [],
  );
});

test("snapshot schema exposes the required one-card-per-day unique key", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(`
      CREATE TABLE price_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        recorded_at DATE NOT NULL,
        UNIQUE(card_id, recorded_at)
      )
    `);
    const result = await client.execute(DAILY_SNAPSHOT_UNIQUE_KEY_SQL);
    assert.deepEqual(
      result.rows.map((row) => String(row.column_name)),
      ["card_id", "recorded_at"],
    );
  } finally {
    client.close();
  }
});
