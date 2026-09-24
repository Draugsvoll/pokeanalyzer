import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  ensureMarketCategoriesStore,
  loadMarketCategories,
  saveMarketCategories,
} from "../services/marketCategories.js";
import { runMarketCategoryGeneration } from "./marketCategoryGenerationJob.js";

async function createDatabase() {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_job_locks (
      name TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
  await ensureMarketCategoriesStore(database);
  return database;
}

test("market category generation saves while holding the maintenance lock", async () => {
  const database = await createDatabase();

  const payload = await runMarketCategoryGeneration(database, []);

  assert.equal(payload?.categories.length, 0);
  assert.equal(
    (await loadMarketCategories(database))?.generatedAt,
    payload?.generatedAt,
  );
  database.close();
});

test("market category generation preserves stored data when the lock is occupied", async () => {
  const database = await createDatabase();
  const existing = {
    schemaVersion: 1 as const,
    generatedAt: "2026-09-24T12:00:00.000Z",
    categories: [],
  };
  await saveMarketCategories(database, existing);
  await database.execute(`
    INSERT INTO poketrace_job_locks (name, token, expires_at)
    VALUES ('poketrace-maintenance', 'another-job', unixepoch('now') + 120)
  `);

  const payload = await runMarketCategoryGeneration(database, []);

  assert.equal(payload, null);
  assert.deepEqual(await loadMarketCategories(database), existing);
  database.close();
});
