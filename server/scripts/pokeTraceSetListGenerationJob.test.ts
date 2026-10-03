import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  ensurePokeTraceCatalogStore,
  loadStoredPokeTraceCatalog,
  savePokeTraceCatalog,
} from "../services/pokeTraceCatalogStore.js";
import {
  ensurePokeTraceFilterOptionsStore,
  loadStoredPokeTraceFilterOptions,
  savePokeTraceFilterOptions,
} from "../services/pokeTraceFilterOptionsStore.js";
import { generateAndSavePokeTraceSetList } from "./pokeTraceSetListGenerationJob.js";

test("generates missing catalog and atomically stores the enriched set list", async () => {
  const database = createClient({ url: "file::memory:" });
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
  await ensurePokeTraceFilterOptionsStore(database);
  await database.execute({
    sql: `
      INSERT INTO poketrace_cards
        (id, name, card_number, set_name, raw_json, tcg_market_comparisons)
      VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)
    `,
    args: [
      "expensive",
      "Card",
      "1/1",
      "Test Set",
      JSON.stringify({
        currency: "USD",
        prices: { tcgplayer: { NEAR_MINT: { avg: 20 } } },
      }),
      JSON.stringify({
        asOf: "2026-10-03",
        comparisons: {
          "1d": null,
          "7d": {
            targetDate: "2026-09-26",
            recordedAt: "2026-09-26",
            marketPrice: 10,
            sourceUpdatedAt: null,
          },
          "30d": null,
        },
      }),
      "cheap",
      "Card",
      "1/1",
      "Test Set",
      JSON.stringify({
        currency: "USD",
        prices: { tcgplayer: { NEAR_MINT: { avg: 12 } } },
      }),
      JSON.stringify({
        asOf: "2026-10-03",
        comparisons: {
          "1d": null,
          "7d": {
            targetDate: "2026-09-26",
            recordedAt: "2026-09-26",
            marketPrice: 10,
            sourceUpdatedAt: null,
          },
          "30d": null,
        },
      }),
    ],
  });

  let lockChecks = 0;
  const result = await generateAndSavePokeTraceSetList(database, () => {
    lockChecks += 1;
  });
  const catalog = await loadStoredPokeTraceCatalog(database);
  const options = await loadStoredPokeTraceFilterOptions(database);

  assert.equal(result.catalogGenerated, true);
  assert.equal(result.setListUpdated, true);
  assert.equal(lockChecks, 2);
  assert.equal(catalog?.cards.length, 2);
  assert.deepEqual(options?.setSummaries, [
    {
      asOf: catalog?.generatedAt,
      comparableCards: 1,
      currency: "USD",
      pricedCards: 1,
      setName: "Test Set",
      sevenDayChangePercent: 20,
      uniqueCards: 1,
    },
  ]);

  let reuseLockChecks = 0;
  const reused = await generateAndSavePokeTraceSetList(database, () => {
    reuseLockChecks += 1;
  });
  assert.equal(reused.catalogGenerated, false);
  assert.equal(reused.setListUpdated, false);
  assert.equal(reuseLockChecks, 0);
  database.close();
});

test("preserves the existing set list when its atomic save fails", async (t) => {
  const database = createClient({ url: "file::memory:" });
  t.after(() => database.close());
  await ensurePokeTraceCatalogStore(database);
  await ensurePokeTraceFilterOptionsStore(database);

  await savePokeTraceCatalog(database, {
    schemaVersion: 2,
    generatedAt: "2026-10-03T01:00:00.000Z",
    cards: [
      {
        id: "card-1",
        name: "Card",
        number: "1/1",
        setName: "Test Set",
        currency: "USD",
        conditionPrices: { NEAR_MINT: 12 },
        priceSnapshots: { "1d": null, "7d": 10, "30d": null },
      },
    ],
  });

  const existingOptions = {
    schemaVersion: 2 as const,
    generatedAt: "2026-10-02T01:00:00.000Z",
    rarities: ["Rare"],
    setNames: ["Existing Set"],
    setSummaries: [],
  };
  await savePokeTraceFilterOptions(database, existingOptions);
  await database.execute(`
    CREATE TRIGGER reject_set_list_update
    BEFORE UPDATE ON poketrace_filter_options
    BEGIN
      SELECT RAISE(ABORT, 'forced set-list save failure');
    END
  `);

  await assert.rejects(
    generateAndSavePokeTraceSetList(database, () => {}),
    /forced set-list save failure/,
  );
  assert.deepEqual(
    await loadStoredPokeTraceFilterOptions(database),
    existingOptions,
  );
});
