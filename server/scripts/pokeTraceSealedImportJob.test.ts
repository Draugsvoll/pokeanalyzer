import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { migratePokeTraceDatabase } from "../db/pokeTraceDb.js";
import type {
  PokeTraceSealedPage,
  PokeTraceSealedProduct,
} from "../services/pokeTraceApi.js";
import {
  loadStoredPokeTraceSealedCatalog,
  savePokeTraceSealedCatalog,
} from "../services/pokeTraceSealedCatalogStore.js";
import {
  importPokeTraceSealedProducts,
  POKETRACE_SEALED_IMPORT_NAME,
  type PokeTraceSealedImportCheckpoint,
} from "./pokeTraceSealedImportJob.js";
import { sealedProductUpsert } from "../services/pokeTraceSealedStore.js";

function sealedProduct(id: string, name: string): PokeTraceSealedProduct {
  return {
    id,
    name,
    set: { name: "XY Base Set" },
    variant: "Normal",
    image: `https://cdn.poketrace.com/cards/${id}.webp`,
    refs: { tcgplayerId: id },
    game: "pokemon",
    market: "US",
    productType: "sealed",
    productFamily: "booster_box",
    prices: { tcgplayer: { UNOPENED: { avg: 100 } } },
  };
}

const firstProduct = sealedProduct(
  "019bff85-5452-714a-9660-a3559a2d5d95",
  "XY Booster Box",
);
const secondProduct = sealedProduct(
  "019bff85-5452-714a-9660-a3559a2d5d96",
  "Flashfire Booster Box",
);
const obsoleteProduct = sealedProduct(
  "019bff85-5452-714a-9660-a3559a2d5d97",
  "Obsolete Box",
);

test("sealed import checkpoints pages, resumes, and never writes singles", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);

  try {
    await database.execute(sealedProductUpsert(obsoleteProduct));
    let firstRunRequests = 0;
    const checkpoints: PokeTraceSealedImportCheckpoint[] = [];
    await assert.rejects(
      importPokeTraceSealedProducts("test-key", () => {}, {
        database,
        fetchPage: async (_apiKey, filters) => {
          firstRunRequests += 1;
          if (firstRunRequests === 1) {
            assert.deepEqual(filters, {});
            return {
              data: [firstProduct],
              pagination: { hasMore: true, nextCursor: "next-page" },
            };
          }
          assert.deepEqual(filters, { cursor: "next-page" });
          throw new Error("temporary interruption");
        },
        log: () => {},
        requestGapMs: 0,
        createCrawlId: () => "import-crawl",
        onCheckpoint: (checkpoint) => checkpoints.push(checkpoint),
      }),
      /temporary interruption/,
    );

    assert.deepEqual(checkpoints.at(-1), {
      complete: false,
      finalized: false,
      importedCount: 1,
      nextCursor: "next-page",
    });

    const partialProducts = await database.execute(
      "SELECT id FROM poketrace_sealed_products ORDER BY id",
    );
    assert.deepEqual(
      partialProducts.rows.map((row) => row.id),
      [firstProduct.id, obsoleteProduct.id],
    );
    const partialProgress = await database.execute({
      sql: `
        SELECT next_cursor, imported_count, complete, finalized, crawl_id
        FROM poketrace_sealed_import_progress
        WHERE name = ?
      `,
      args: [POKETRACE_SEALED_IMPORT_NAME],
    });
    assert.deepEqual(
      { ...partialProgress.rows[0] },
      {
        next_cursor: "next-page",
        imported_count: 1,
        complete: 0,
        finalized: 0,
        crawl_id: "import-crawl",
      },
    );
    assert.equal(await loadStoredPokeTraceSealedCatalog(database), null);

    const resumedFilters: Record<string, string>[] = [];
    const result = await importPokeTraceSealedProducts("test-key", () => {}, {
      database,
      fetchPage: async (_apiKey, filters): Promise<PokeTraceSealedPage> => {
        resumedFilters.push(filters);
        return {
          data: [secondProduct],
          pagination: { hasMore: false, nextCursor: null },
        };
      },
      log: () => {},
      requestGapMs: 0,
    });

    assert.deepEqual(resumedFilters, [{ cursor: "next-page" }]);
    assert.deepEqual(result, {
      complete: true,
      importedCount: 2,
      nextCursor: null,
      removedProducts: 1,
      storedCount: 2,
    });
    const singles = await database.execute(
      "SELECT COUNT(*) AS count FROM poketrace_cards",
    );
    assert.equal(Number(singles.rows[0]?.count), 0);
    const published = await loadStoredPokeTraceSealedCatalog(database);
    assert.equal(published?.products.length, 2);

    let completedImportRequests = 0;
    const completed = await importPokeTraceSealedProducts(
      "test-key",
      () => {},
      {
        database,
        fetchPage: async () => {
          completedImportRequests += 1;
          throw new Error("completed imports must not fetch again");
        },
        log: () => {},
        requestGapMs: 0,
      },
    );
    assert.equal(completedImportRequests, 0);
    assert.deepEqual(completed, {
      complete: true,
      importedCount: 2,
      nextCursor: null,
      removedProducts: 0,
      storedCount: 2,
    });
  } finally {
    database.close();
  }
});

test("sealed import retries finalization after catalog publication fails", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);
  const previousCatalog = {
    schemaVersion: 1 as const,
    generatedAt: "2026-10-05T00:00:00.000Z",
    products: [
      {
        id: obsoleteProduct.id,
        name: obsoleteProduct.name,
        setName: "XY Base Set",
        productFamily: "booster_box",
        currency: "USD",
        price: 100,
        priceSnapshots: { "1d": null, "7d": null, "30d": null },
      },
    ],
  };

  try {
    await database.execute(sealedProductUpsert(obsoleteProduct));
    await savePokeTraceSealedCatalog(database, previousCatalog);
    let fetches = 0;
    const failedCheckpoints: PokeTraceSealedImportCheckpoint[] = [];

    await assert.rejects(
      importPokeTraceSealedProducts("test-key", () => {}, {
        createCrawlId: () => "retry-crawl",
        database,
        fetchPage: async () => {
          fetches += 1;
          return {
            data: [firstProduct],
            pagination: { hasMore: false, nextCursor: null },
          };
        },
        log: () => {},
        onCheckpoint: (checkpoint) => failedCheckpoints.push(checkpoint),
        publishCatalog: async () => {
          throw new Error("catalog publication failed");
        },
        requestGapMs: 0,
      }),
      /catalog publication failed/,
    );

    assert.equal(fetches, 1);
    assert.deepEqual(failedCheckpoints.at(-1), {
      complete: true,
      finalized: false,
      importedCount: 1,
      nextCursor: null,
    });
    const pending = await database.execute({
      sql: `
        SELECT complete, finalized, crawl_id
        FROM poketrace_sealed_import_progress
        WHERE name = ?
      `,
      args: [POKETRACE_SEALED_IMPORT_NAME],
    });
    assert.deepEqual(
      { ...pending.rows[0] },
      { complete: 1, finalized: 0, crawl_id: "retry-crawl" },
    );
    assert.deepEqual(
      await loadStoredPokeTraceSealedCatalog(database),
      previousCatalog,
    );

    const retryCheckpoints: PokeTraceSealedImportCheckpoint[] = [];
    const result = await importPokeTraceSealedProducts("test-key", () => {}, {
      database,
      fetchPage: async () => {
        throw new Error("finalization retry must not fetch pages");
      },
      log: () => {},
      onCheckpoint: (checkpoint) => retryCheckpoints.push(checkpoint),
      requestGapMs: 0,
    });

    assert.deepEqual(result, {
      complete: true,
      importedCount: 1,
      nextCursor: null,
      removedProducts: 0,
      storedCount: 1,
    });
    assert.equal(retryCheckpoints.at(-1)?.finalized, true);
    const finalized = await database.execute({
      sql: `
        SELECT finalized
        FROM poketrace_sealed_import_progress
        WHERE name = ?
      `,
      args: [POKETRACE_SEALED_IMPORT_NAME],
    });
    assert.equal(Number(finalized.rows[0]?.finalized), 1);
    const published = await loadStoredPokeTraceSealedCatalog(database);
    assert.deepEqual(
      published?.products.map((product) => product.id),
      [firstProduct.id],
    );
  } finally {
    database.close();
  }
});

test("sealed import rejects a repeated pagination cursor", async () => {
  const database = createClient({ url: ":memory:" });
  await migratePokeTraceDatabase(database);

  try {
    await database.execute({
      sql: `
        INSERT INTO poketrace_sealed_import_progress
          (name, next_cursor, imported_count, complete)
        VALUES (?, ?, 20, 0)
      `,
      args: [POKETRACE_SEALED_IMPORT_NAME, "same-cursor"],
    });

    await assert.rejects(
      importPokeTraceSealedProducts("test-key", () => {}, {
        database,
        fetchPage: async () => ({
          data: [firstProduct],
          pagination: { hasMore: true, nextCursor: "same-cursor" },
        }),
        log: () => {},
        requestGapMs: 0,
      }),
      /repeated a sealed pagination cursor/,
    );
  } finally {
    database.close();
  }
});
