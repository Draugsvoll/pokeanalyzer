import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { loadPokeTraceSearchPage } from "./pokeTraceSearch.js";

async function createSearchDatabase() {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      card_number TEXT,
      set_name TEXT,
      rarity TEXT,
      variant TEXT,
      raw_json TEXT NOT NULL,
      tcg_market_comparisons TEXT NOT NULL DEFAULT '{}'
    )
  `);
  return database;
}

function cardInsert({
  id,
  name,
  number,
  rarity,
  tcgplayer,
}: {
  id: string;
  name: string;
  number: number;
  rarity: string;
  tcgplayer: Record<string, { avg: number }>;
}) {
  return {
    sql: `
      INSERT INTO poketrace_cards
        (id, name, card_number, set_name, rarity, variant, raw_json)
      VALUES (?, ?, ?, 'Test Set', ?, 'Normal', ?)
    `,
    args: [
      id,
      name,
      String(number),
      rarity,
      JSON.stringify({
        cardNumber: String(number),
        currency: "USD",
        id,
        name,
        prices: { tcgplayer },
        rarity,
        set: { name: "Test Set" },
        variant: "Normal",
      }),
    ],
  };
}

test("search counts only the first page and caps pagination at 2,000 results", async () => {
  const database = await createSearchDatabase();

  await database.batch(
    Array.from({ length: 2_001 }, (_, index) => {
      const number = index + 1;
      const id = `card-${number}`;
      return cardInsert({
        id,
        name: `Card ${number}`,
        number,
        rarity: "Rare",
        tcgplayer: { NEAR_MINT: { avg: number } },
      });
    }),
    "write",
  );

  const query = {
    cardId: "",
    cardNumber: "",
    maxPrice: undefined,
    minPrice: undefined,
    pokemonName: "Card",
    rarity: "",
    setName: "",
    sort: "price-high-low" as const,
  };
  const firstPage = await loadPokeTraceSearchPage(
    { ...query, offset: 0 },
    database,
    Promise.resolve(),
  );
  const secondPage = await loadPokeTraceSearchPage(
    { ...query, offset: 50 },
    database,
    Promise.resolve(),
  );
  const thirdPage = await loadPokeTraceSearchPage(
    { ...query, offset: 100 },
    database,
    Promise.resolve(),
  );
  const finalPage = await loadPokeTraceSearchPage(
    { ...query, offset: 1_950 },
    database,
    Promise.resolve(),
  );

  assert.equal(firstPage.total, 2_000);
  assert.equal(firstPage.items.length, 50);
  assert.equal(firstPage.items[0]?.id, "card-2001");
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextOffset, 50);
  assert.equal(secondPage.total, null);
  assert.equal(secondPage.items.length, 50);
  assert.equal(secondPage.items[0]?.id, "card-1951");
  assert.equal(secondPage.hasMore, true);
  assert.equal(secondPage.nextOffset, 100);
  assert.equal(thirdPage.total, null);
  assert.equal(thirdPage.items.length, 50);
  assert.equal(thirdPage.items[0]?.id, "card-1901");
  assert.equal(thirdPage.hasMore, true);
  assert.equal(thirdPage.nextOffset, 150);
  assert.equal(finalPage.total, null);
  assert.equal(finalPage.items.length, 50);
  assert.equal(finalPage.items[0]?.id, "card-51");
  assert.equal(finalPage.hasMore, false);
  assert.equal(finalPage.nextOffset, null);

  database.close();
});

test("search applies the Near Mint price range and exact rarity", async () => {
  const database = await createSearchDatabase();
  await database.batch(
    [
      cardInsert({
        id: "matching-common",
        name: "Matching Card",
        number: 1,
        rarity: "Common",
        tcgplayer: {
          LIGHTLY_PLAYED: { avg: 100 },
          NEAR_MINT: { avg: 25 },
        },
      }),
      cardInsert({
        id: "uncommon",
        name: "Uncommon Card",
        number: 2,
        rarity: "Uncommon",
        tcgplayer: { NEAR_MINT: { avg: 25 } },
      }),
      cardInsert({
        id: "below-range",
        name: "Below Range",
        number: 3,
        rarity: "Common",
        tcgplayer: { NEAR_MINT: { avg: 10 } },
      }),
      cardInsert({
        id: "lightly-played-only",
        name: "Lightly Played Only",
        number: 4,
        rarity: "Common",
        tcgplayer: { LIGHTLY_PLAYED: { avg: 25 } },
      }),
    ],
    "write",
  );

  const page = await loadPokeTraceSearchPage(
    {
      cardId: "",
      cardNumber: "",
      maxPrice: 30,
      minPrice: 20,
      offset: 0,
      pokemonName: "",
      rarity: "Common",
      setName: "",
      sort: "price-high-low",
    },
    database,
    Promise.resolve(),
  );

  assert.equal(page.total, 1);
  assert.deepEqual(
    page.items.map((card) => card.id),
    ["matching-common"],
  );

  database.close();
});
