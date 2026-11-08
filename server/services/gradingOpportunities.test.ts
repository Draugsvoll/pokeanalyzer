import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  findGradingOpportunities,
  normalizeGradingOpportunitiesOptions,
} from "./gradingOpportunities.js";
import { loadGradingOpportunityList } from "./gradingOpportunityList.js";
import { runGradingOpportunityListGeneration } from "../scripts/gradingOpportunityListGenerationJob.js";

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
  psa: ReturnType<typeof tier> & { median3d?: number | null },
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
          NEAR_MINT: { US: { ebay: nearMint, tcgplayer: tcgNearMint } },
          PSA_10: { US: { ebay: psa } },
        },
      }),
    ],
  });
}

test("uses the displayed TCG Near Mint average and only the PSA 10 30-day median", async (t) => {
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
  await insertCard(
    database,
    "seven-day-only",
    "Seven Day Only",
    tier(100, 90, 75),
    tier(2000, null, 80),
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
      ["thirty-day-only", 40, "30d", 2_200, 55],
      ["larger-gap", 100, "30d", 4_000, 40],
      ["no-ebay-raw-median", 100, "30d", 4_000, 40],
      ["high-multiple", 50, "30d", 1_500, 30],
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
  const qualifiedRaw = tier(100, 90, 40);
  const qualifiedPsa = tier(1_000, 900, 40);
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
    tier(500, 549, 50),
  );
  await insertCard(
    database,
    "few-raw-sales",
    "Few Raw Sales",
    tier(100, 90, 39),
    qualifiedPsa,
  );
  await insertCard(
    database,
    "few-psa-sales",
    "Few PSA Sales",
    qualifiedRaw,
    tier(1_000, 900, 39),
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
    tier(25, 20, 40, "2026-10-02T12:00:00.000Z"),
    tier(450, 475, 40, "2026-10-02T12:00:00.000Z"),
  );

  const result = await findGradingOpportunities(database, { limit: 12 });

  assert.deepEqual(
    result.items.map((item) => item.cardId),
    ["cheap", "boundary", "qualified"],
  );
  database.close();
});

test("excludes identical PSA medians before ranking and limiting, while retaining missing or unequal medians", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-01T12:00:00Z"),
  });
  const database = await createDatabase();
  t.after(() => database.close());
  const raw = tier(25, 25, 100);
  const cases = [
    {
      id: "identical",
      price: { ...tier(50_000, 50_000, 100), median3d: 50_000 },
    },
    {
      id: "different-3d",
      price: { ...tier(1_000, 1_000, 100), median3d: 900 },
    },
    {
      id: "different-30d",
      price: { ...tier(1_000, 900, 100), median3d: 1_000 },
    },
    { id: "missing-3d", price: tier(1_000, 1_000, 100) },
    { id: "null-3d", price: { ...tier(1_000, 1_000, 100), median3d: null } },
    { id: "null-7d", price: { ...tier(null, 1_000, 100), median3d: 1_000 } },
    { id: "null-30d", price: { ...tier(1_000, null, 100), median3d: 1_000 } },
  ];
  for (const { id, price } of cases) {
    await insertCard(database, id, id, raw, price);
  }
  const result = await findGradingOpportunities(database);
  assert.deepEqual(
    result.items.map(({ cardId }) => cardId).sort(),
    cases
      .filter(({ id }) => id !== "identical" && id !== "null-30d")
      .map(({ id }) => id)
      .sort(),
  );
  const limited = await findGradingOpportunities(database, { limit: 1 });
  assert.deepEqual(
    limited.items.map(({ cardId }) => cardId),
    ["different-3d"],
  );
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

test("unlimited generation saves all qualified cards while the original category still returns its top 12", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-01T12:00:00Z"),
  });
  const db = await createDatabase();
  try {
    await db.execute(
      "CREATE TABLE poketrace_job_locks (name TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    );
    for (let i = 0; i < 125; i++) {
      await insertCard(
        db,
        `qualified-${i}`,
        `Qualified ${i}`,
        tier(10, 15, 75),
        { ...tier(700, 600 + i, 75), median3d: 550 },
      );
    }
    await insertCard(
      db,
      "low-sales",
      "Low sales",
      tier(10, 15, 75),
      tier(5000, 6000, 39),
    );
    await insertCard(db, "identical", "Identical medians", tier(10, 15, 75), {
      ...tier(5000, 5000, 100),
      median3d: 5000,
    });
    const limited = await findGradingOpportunities(db);
    const full = await findGradingOpportunities(db, { limit: null });
    assert.equal(limited.items.length, 12);
    assert.equal(full.items.length, 125);
    assert.deepEqual(full.items.slice(0, 12), limited.items);
    const saved = await runGradingOpportunityListGeneration(db);
    assert.equal(saved?.items.length, 125);
    assert.deepEqual(await loadGradingOpportunityList(db), saved);
    assert.deepEqual(saved?.items[0], {
      cardId: "qualified-124",
      psa10Price: 724,
    });
    await db.execute("UPDATE poketrace_cards SET raw_json = '{}' ");
    await runGradingOpportunityListGeneration(db);
    assert.deepEqual((await loadGradingOpportunityList(db))?.items, []);
  } finally {
    db.close();
  }
});
