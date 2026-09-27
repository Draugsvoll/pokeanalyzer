import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { loadDirectPokeTraceSearch } from "./pokeTraceDirectSearch.js";

test("cold search queries exact set matches directly from the cards table", async () => {
  const database = createClient({ url: ":memory:" });
  try {
    await database.execute(`
      CREATE TABLE poketrace_cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        card_number TEXT,
        set_name TEXT NOT NULL,
        rarity TEXT,
        variant TEXT,
        image_url TEXT,
        raw_json TEXT NOT NULL,
        tcg_market_comparisons TEXT NOT NULL DEFAULT '{}'
      )
    `);
    const rawJson = JSON.stringify({
      currency: "USD",
      prices: { tcgplayer: { NEAR_MINT: { avg: 25 } } },
    });
    await database.batch([
      {
        sql: `INSERT INTO poketrace_cards
          (id, name, card_number, set_name, rarity, raw_json)
          VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          "base-4",
          "Charizard",
          "4/102",
          "Base Set",
          "Rare Holo",
          rawJson,
        ],
      },
      {
        sql: `INSERT INTO poketrace_cards
          (id, name, card_number, set_name, rarity, raw_json)
          VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          "base2-4",
          "Charizard",
          "4/130",
          "Base Set 2",
          "Rare Holo",
          rawJson,
        ],
      },
    ]);

    const result = await loadDirectPokeTraceSearch(
      {
        cardNumber: "4",
        pokemonName: "char",
        rarity: "Rare Holo",
        setName: "base set",
        setNameExact: true,
      },
      { database, ensureReady: async () => undefined },
    );

    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.id, "base-4");
    assert.deepEqual(result.items[0]?.pokeTrace.prices, {
      tcgplayer: { NEAR_MINT: { avg: 25 } },
    });
  } finally {
    database.close();
  }
});
