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

test("cold search applies contains and price filters entirely in SQL", async () => {
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
    const card = (
      id: string,
      name: string,
      setName: string,
      nearMintPrice: number | null,
    ) => ({
      sql: `INSERT INTO poketrace_cards
        (id, name, card_number, set_name, rarity, raw_json)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        name,
        "25/100",
        setName,
        "Rare",
        JSON.stringify({
          currency: "USD",
          prices: {
            tcgplayer: {
              ...(nearMintPrice !== null && {
                NEAR_MINT: { avg: nearMintPrice },
              }),
            },
          },
        }),
      ],
    });
    await database.batch([
      card("matching", "Pikachu ex", "Test_Set 100%", 25),
      card("wrong-name", "Raichu", "Test_Set 100%", 25),
      card("zero-price", "Pikachu", "Test_Set 100%", 0),
      card("wrong-set", "Pikachu", "TestXSet 1000", 25),
    ]);

    const result = await loadDirectPokeTraceSearch(
      {
        cardNumber: "25",
        maxPrice: 30,
        minPrice: 20,
        pokemonName: "PIKA",
        rarity: "rare",
        setName: "_Set 100%",
      },
      { database, ensureReady: async () => undefined },
    );

    assert.deepEqual(
      result.items.map((item) => item.id),
      ["matching"],
    );
  } finally {
    database.close();
  }
});
