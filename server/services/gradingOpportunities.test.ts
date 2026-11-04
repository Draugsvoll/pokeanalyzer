import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  findGradingOpportunities,
  normalizeGradingOpportunitiesOptions,
} from "./gradingOpportunities.js";

const fresh = "2026-10-20T00:00:00.000Z";

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

function tier(
  median7d: number | null,
  median30d: number | null,
  saleCount: number,
  lastUpdated = fresh,
) {
  return { lastUpdated, median7d, median30d, saleCount };
}

async function insertCard(
  database: Awaited<ReturnType<typeof createDatabase>>,
  id: string,
  name: string,
  nearMint: ReturnType<typeof tier>,
  psa: ReturnType<typeof tier>,
  tcgNearMint = {
    avg: nearMint.median7d,
    saleCount: nearMint.saleCount,
    lastUpdated: nearMint.lastUpdated,
  },
) {
  await database.execute({
    sql: `INSERT INTO poketrace_cards
      (id, name, card_number, set_name, rarity, variant, image_url, raw_json)
      VALUES (?, ?, '1', 'Test Set', 'Rare', 'Holofoil', ?, ?)`,
    args: [
      id,
      name,
      `${id}.jpg`,
      JSON.stringify({
        currency: "USD",
        prices: {
          ebay: { NEAR_MINT: nearMint, PSA_10: psa },
          tcgplayer: { NEAR_MINT: tcgNearMint },
        },
      }),
    ],
  });
}

test("uses the displayed TCG Near Mint average and only the PSA 10 seven-day median", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-01T12:00:00Z"),
  });
  const database = await createDatabase();
  await insertCard(
    database,
    "high-multiple",
    "High Multiple",
    tier(25, 20, 75),
    tier(2_000, 1_500, 80),
    { avg: 50, saleCount: 75, lastUpdated: fresh },
  );
  await insertCard(
    database,
    "larger-gap",
    "Larger Gap",
    tier(100, 120, 200),
    tier(3_000, 4_000, 90),
  );
  await insertCard(
    database,
    "thirty-day-only",
    "Thirty Day",
    tier(null, 40, 75),
    tier(null, 2_200, 75),
    { avg: 40, saleCount: 75, lastUpdated: fresh },
  );

  await insertCard(
    database,
    "no-ebay-raw-median",
    "No Ebay Raw Median",
    tier(null, null, 0),
    tier(2_000, 4_000, 80),
    { avg: 100, saleCount: 100, lastUpdated: fresh },
  );
  await insertCard(
    database,
    "missing-tcg-price",
    "Missing TCG Price",
    tier(25, 20, 75),
    tier(2_000, 1_500, 80),
    { avg: null, saleCount: 100, lastUpdated: fresh },
  );

  const result = await findGradingOpportunities(database);

  assert.equal(result.status, "ready");
  assert.equal(result.updatedAfter, "2026-10-02T12:00:00.000Z");
  assert.equal(
    (result.items[0]?.tcgPrices.NEAR_MINT as { avg: number }).avg,
    result.items[0]?.nearMintPrice,
  );
  assert.deepEqual(
    result.items.map((item) => [
      item.cardId,
      item.nearMintPrice,
      item.psaMedian,
      item.psaPrice,
      item.multiplier,
    ]),
    [
      ["high-multiple", 50, "7d", 2_000, 40],
      ["larger-gap", 100, "7d", 3_000, 30],
      ["no-ebay-raw-median", 100, "7d", 2_000, 20],
    ],
  );
  database.close();
});

test("rejects cards outside the sales, gap, and freshness rules", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-01T12:00:00Z"),
  });
  const database = await createDatabase();
  const qualifiedRaw = tier(100, 90, 75);
  const qualifiedPsa = tier(1_000, 900, 75);
  await insertCard(
    database,
    "qualified",
    "Qualified",
    qualifiedRaw,
    qualifiedPsa,
  );
  await insertCard(
    database,
    "cheap",
    "Cheap",
    tier(19.99, 10, 75),
    tier(800, 700, 75),
  );
  await insertCard(
    database,
    "small-gap",
    "Small Gap",
    tier(100, 90, 75),
    tier(599, 500, 75),
  );
  await insertCard(
    database,
    "few-raw-sales",
    "Few Raw Sales",
    tier(100, 90, 74),
    qualifiedPsa,
  );
  await insertCard(
    database,
    "few-psa-sales",
    "Few PSA Sales",
    qualifiedRaw,
    tier(1_000, 900, 74),
  );
  await insertCard(
    database,
    "stale-raw",
    "Stale Raw",
    tier(100, 90, 75, "2026-10-02T11:59:59.000Z"),
    qualifiedPsa,
  );
  await insertCard(
    database,
    "stale-psa",
    "Stale PSA",
    qualifiedRaw,
    tier(1_000, 900, 75, "2026-09-01T00:00:00.000Z"),
  );
  await insertCard(
    database,
    "boundary",
    "Boundary",
    tier(50, 40, 75, "2026-10-02T12:00:00.000Z"),
    tier(700, 600, 75, "2026-10-02T12:00:00.000Z"),
  );

  const result = await findGradingOpportunities(database, { limit: 12 });

  assert.deepEqual(
    result.items.map((item) => item.cardId),
    ["cheap", "boundary", "qualified"],
  );
  database.close();
});

test("rejects unsafe grading opportunity parameters", () => {
  assert.throws(
    () => normalizeGradingOpportunitiesOptions({ minimumNearMintPrice: -1 }),
    /minimumNearMintPrice/,
  );
  assert.throws(
    () => normalizeGradingOpportunitiesOptions({ maximumUpdateAgeDays: 0 }),
    /maximumUpdateAgeDays/,
  );
  assert.throws(
    () => normalizeGradingOpportunitiesOptions({ minimumPsaPriceIncrease: -1 }),
    /minimumPsaPriceIncrease/,
  );
});
