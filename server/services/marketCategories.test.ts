import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  ensureMarketCategoriesStore,
  generateMarketCategories,
  loadMarketCategories,
  saveMarketCategories,
} from "./marketCategories.js";

test("stores and replaces the complete generated category payload", async () => {
  const database = createClient({ url: "file::memory:" });
  await ensureMarketCategoriesStore(database);

  await saveMarketCategories(
    database,
    await generateMarketCategories(database, []),
  );
  const second = await generateMarketCategories(database, []);
  await saveMarketCategories(database, second);
  const stored = await loadMarketCategories(database);

  assert.equal(stored?.schemaVersion, 1);
  assert.deepEqual(stored?.categories, []);
  assert.equal(stored?.generatedAt, second.generatedAt);

  const rows = await database.execute(
    "SELECT COUNT(*) AS count FROM poketrace_market_categories",
  );
  assert.equal(Number(rows.rows[0]?.count), 1);
  database.close();
});

test("returns null before categories have been generated", async () => {
  const database = createClient({ url: "file::memory:" });
  await ensureMarketCategoriesStore(database);

  assert.equal(await loadMarketCategories(database), null);
  database.close();
});
