import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  POKETRACE_SEALED_CATALOG_SCHEMA_VERSION,
  type PokeTraceSealedCatalogResponse,
} from "../../shared/pokeTraceSealed.js";
import {
  ensurePokeTraceSealedCatalogStore,
  loadStoredPokeTraceSealedCatalog,
  savePokeTraceSealedCatalog,
} from "./pokeTraceSealedCatalogStore.js";

function catalog(
  id: string,
  generatedAt: string,
): PokeTraceSealedCatalogResponse {
  return {
    schemaVersion: POKETRACE_SEALED_CATALOG_SCHEMA_VERSION,
    generatedAt,
    products: [
      {
        id,
        name: "XY Booster Box",
        setName: "XY Base Set",
        productFamily: "booster_box",
        currency: "USD",
        price: 150,
        priceSnapshots: { "1d": 149, "7d": 145, "30d": 140 },
      },
    ],
  };
}

test("stores and atomically replaces the sealed search catalog", async () => {
  const database = createClient({ url: "file::memory:" });
  await ensurePokeTraceSealedCatalogStore(database);
  const first = catalog("product-1", "2026-10-05T00:00:00.000Z");
  const second = catalog("product-2", "2026-10-06T00:00:00.000Z");

  try {
    await savePokeTraceSealedCatalog(database, first);
    await savePokeTraceSealedCatalog(database, second);

    assert.deepEqual(await loadStoredPokeTraceSealedCatalog(database), second);
    const rows = await database.execute(
      "SELECT COUNT(*) AS count FROM poketrace_sealed_catalog_payloads",
    );
    assert.equal(Number(rows.rows[0]?.count), 1);
  } finally {
    database.close();
  }
});

test("returns null before the sealed search catalog is published", async () => {
  const database = createClient({ url: "file::memory:" });
  await ensurePokeTraceSealedCatalogStore(database);

  try {
    assert.equal(await loadStoredPokeTraceSealedCatalog(database), null);
  } finally {
    database.close();
  }
});
