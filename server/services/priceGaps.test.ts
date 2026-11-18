import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { MARKET_CATEGORY_DEFINITIONS } from "../config/marketCategories.js";
import { findPriceGaps } from "./priceGaps.js";

async function createDatabase() {
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
      tcg_market_comparisons TEXT,
      raw_json TEXT NOT NULL
    )
  `);
  return database;
}

async function insertCard(
  database: Awaited<ReturnType<typeof createDatabase>>,
  id: string,
  prices: {
    tcg?: number;
    tcgSales?: number;
    avg30d?: number;
    cardmarket?: number;
    psaSales?: number;
  },
) {
  await database.execute({
    sql: `INSERT INTO poketrace_cards
      (id, name, card_number, set_name, rarity, variant, image_url, raw_json)
      VALUES (?, ?, '1', 'Test', 'Rare', 'Normal', ?, ?)`,
    args: [
      id,
      id,
      `${id}.jpg`,
      JSON.stringify({
        prices: {
          NEAR_MINT: {
            US: {
              tcgplayer: {
                avg: prices.tcg,
                saleCount: prices.tcgSales,
              },
            },
          },
          AGGREGATED: {
            EU: {
              cardmarket: {
                avg: prices.cardmarket,
                avg30d: prices.avg30d ?? prices.cardmarket,
              },
            },
          },
          PSA_10: {
            US: { ebay: { saleCount: prices.psaSales } },
          },
        },
      }),
    ],
  });
}

test("ranks the largest TCG and Cardmarket gaps that qualify", async () => {
  const database = await createDatabase();
  const definition = MARKET_CATEGORY_DEFINITIONS.find(
    (category) => category.id === "tcg-cardmarket-price-gaps",
  );
  assert.ok(definition?.query === "priceGaps");

  await insertCard(database, "dollar-gap", {
    tcg: 100,
    tcgSales: 100,
    cardmarket: 40,
    psaSales: 10,
  });
  await insertCard(database, "percent-gap", {
    tcg: 25,
    tcgSales: 150,
    cardmarket: 31,
    psaSales: 12,
  });
  await insertCard(database, "dollar-only", {
    tcg: 200,
    tcgSales: 150,
    cardmarket: 175,
    psaSales: 12,
  });
  await insertCard(database, "larger-gap", {
    tcg: 80,
    tcgSales: 400,
    cardmarket: 200,
    psaSales: 20,
  });
  await insertCard(database, "cardmarket-higher", {
    tcg: 50,
    tcgSales: 100,
    cardmarket: 90,
    psaSales: 10,
  });
  await insertCard(database, "cheap", {
    tcg: 19.99,
    tcgSales: 500,
    cardmarket: 80,
    psaSales: 50,
  });
  await insertCard(database, "small-gap", {
    tcg: 100,
    tcgSales: 500,
    cardmarket: 110,
    psaSales: 50,
  });
  await insertCard(database, "few-tcg-sales", {
    tcg: 100,
    tcgSales: 99,
    cardmarket: 10,
    psaSales: 50,
  });
  await insertCard(database, "few-psa-sales", {
    tcg: 100,
    tcgSales: 500,
    cardmarket: 10,
    psaSales: 9,
  });
  await insertCard(database, "trend-only", {
    tcg: 100,
    tcgSales: 500,
    cardmarket: 40,
    avg30d: 105,
    psaSales: 50,
  });
  await insertCard(database, "trend-too-high", {
    tcg: 40,
    tcgSales: 500,
    cardmarket: 160,
    avg30d: 100,
    psaSales: 50,
  });
  await insertCard(database, "trend-too-low", {
    tcg: 200,
    tcgSales: 500,
    cardmarket: 40,
    avg30d: 100,
    psaSales: 50,
  });
  await insertCard(database, "trend-at-bounds", {
    tcg: 200,
    tcgSales: 500,
    cardmarket: 150,
    avg30d: 100,
    psaSales: 50,
  });

  const result = await findPriceGaps(database, definition.parameters);
  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.items.map((item) => [item.cardId, item.gap, item.higherMarket]),
    [
      ["larger-gap", 120, "cardmarket"],
      ["trend-at-bounds", 100, "tcgplayer"],
      ["dollar-gap", 60, "tcgplayer"],
      ["cardmarket-higher", 40, "cardmarket"],
    ],
  );
  assert.equal(
    result.items.find((item) => item.cardId === "dollar-gap")?.cardmarketTrend,
    40,
  );
  assert.equal(
    result.items.find((item) => item.cardId === "cardmarket-higher")
      ?.gapPercent,
    80,
  );
  database.close();
});

test("returns the twelve largest gaps", async () => {
  const database = await createDatabase();
  for (let index = 0; index < 13; index += 1) {
    await insertCard(database, `card-${String(index).padStart(2, "0")}`, {
      tcg: 20 + index,
      tcgSales: 100,
      cardmarket: 80 + index,
      psaSales: 10,
    });
  }

  const result = await findPriceGaps(database, { limit: 12 });
  assert.equal(result.items.length, 12);
  assert.equal(result.items[0]?.cardId, "card-00");
  assert.equal(result.items.at(-1)?.cardId, "card-11");
  database.close();
});
