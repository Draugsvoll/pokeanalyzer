import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog.js";
import {
  ensurePokeTraceCatalogStore,
  loadStoredPokeTraceCatalog,
  savePokeTraceCatalog,
} from "./pokeTraceCatalogStore.js";

function catalog(id: string, generatedAt: string): PokeTraceCatalogResponse {
  return {
    schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
    generatedAt,
    cards: [
      {
        id,
        name: "Charizard",
        setName: "Base Set",
        currency: "USD",
        conditionPrices: { NEAR_MINT: 420 },
        priceSnapshots: { "1d": 410, "7d": 400, "30d": 390 },
      },
    ],
  };
}

test("stores and atomically replaces the generated search catalog", async () => {
  const database = createClient({ url: "file::memory:" });
  await ensurePokeTraceCatalogStore(database);
  const first = catalog("card-1", "2026-09-24T22:00:00.000Z");
  const second = catalog("card-2", "2026-09-25T22:00:00.000Z");

  await savePokeTraceCatalog(database, first);
  await savePokeTraceCatalog(database, second);

  assert.deepEqual(await loadStoredPokeTraceCatalog(database), second);
  const rows = await database.execute(
    "SELECT COUNT(*) AS count FROM poketrace_catalog_payloads",
  );
  assert.equal(Number(rows.rows[0]?.count), 1);
  database.close();
});

test("returns null before the search catalog has been generated", async () => {
  const database = createClient({ url: "file::memory:" });
  await ensurePokeTraceCatalogStore(database);

  assert.equal(await loadStoredPokeTraceCatalog(database), null);
  database.close();
});
