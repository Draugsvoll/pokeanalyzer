import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  ensurePokeTraceCatalogStore,
  loadStoredPokeTraceCatalog,
  savePokeTraceCatalog,
} from "../services/pokeTraceCatalogStore.js";
import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog.js";
import { runPokeTraceCatalogGeneration } from "./pokeTraceCatalogGenerationJob.js";

async function createDatabase() {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_job_locks (
      name TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE poketrace_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      card_number TEXT,
      set_name TEXT,
      rarity TEXT,
      variant TEXT,
      image_url TEXT,
      raw_json TEXT NOT NULL,
      tcg_market_comparisons TEXT NOT NULL DEFAULT '{}'
    )
  `);
  await ensurePokeTraceCatalogStore(database);
  return database;
}

function existingCatalog(): PokeTraceCatalogResponse {
  return {
    schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
    generatedAt: "2026-09-24T22:00:00.000Z",
    cards: [
      {
        id: "existing-card",
        name: "Existing Card",
        setName: "Existing Set",
        currency: "USD",
        conditionPrices: { NEAR_MINT: 10 },
        priceSnapshots: { "1d": null, "7d": null, "30d": null },
      },
    ],
  };
}

test("catalog generation stores the complete payload while holding the lock", async () => {
  const database = await createDatabase();
  await database.execute({
    sql: `
      INSERT INTO poketrace_cards
        (id, name, card_number, set_name, rarity, variant, image_url, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      "card-1",
      "Charizard",
      "004/102",
      "Base Set",
      "Holo Rare",
      "Unlimited Holofoil",
      "https://example.test/charizard.webp",
      JSON.stringify({
        currency: "USD",
        prices: { tcgplayer: { NEAR_MINT: { avg: 420 } } },
      }),
    ],
  });

  const catalog = await runPokeTraceCatalogGeneration(database);

  assert.equal(catalog?.cards.length, 1);
  assert.equal(catalog?.cards[0]?.id, "card-1");
  assert.deepEqual(await loadStoredPokeTraceCatalog(database), catalog);
  database.close();
});

test("catalog generation preserves stored data when the lock is occupied", async () => {
  const database = await createDatabase();
  const existing = existingCatalog();
  await savePokeTraceCatalog(database, existing);
  await database.execute(`
    INSERT INTO poketrace_job_locks (name, token, expires_at)
    VALUES ('poketrace-maintenance', 'another-job', unixepoch('now') + 120)
  `);

  const catalog = await runPokeTraceCatalogGeneration(database);

  assert.equal(catalog, null);
  assert.deepEqual(await loadStoredPokeTraceCatalog(database), existing);
  database.close();
});
