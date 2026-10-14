import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migratePokeTraceDatabase } from "../db/pokeTraceDb.js";
import type { PokeTraceSealedProduct } from "./pokeTraceApi.js";
import {
  expiredSealedMarketSnapshotsDelete,
  sealedProductAndDailyPriceUpserts,
} from "./pokeTraceSealedStore.js";

const product: PokeTraceSealedProduct = {
  id: "box",
  name: "Booster Box",
  game: "pokemon",
  market: "US",
  productType: "sealed",
  productFamily: "booster_box",
  currency: "USD",
};

test("sealed sales retain separate days and update same-day counts, including decreases", async () => {
  const database = createClient({ url: ":memory:" });
  try {
    await migratePokeTraceDatabase(database);
    for (const [date, count] of [
      ["2026-10-04", 200],
      ["2026-10-05", 210],
      ["2026-10-05", 205],
    ] as const) {
      await database.batch(
        sealedProductAndDailyPriceUpserts(
          {
            ...product,
            lastUpdated: `${date}T08:00:00.000Z`,
            prices: {
              tcgplayer: {
                UNOPENED: {
                  avg: 150,
                  saleCount: count,
                  approxSaleCount: false,
                },
              },
              ebay: { UNOPENED: { saleCount: 0, approxSaleCount: true } },
            },
          },
          date,
        ),
        "write",
      );
    }
    const result = await database.execute(`
      SELECT recorded_at, currency, source_updated_at,
        json_extract(tcg, '$.UNOPENED.saleCount') AS tcg_sales,
        json_extract(ebay, '$.UNOPENED.saleCount') AS ebay_sales,
        json_extract(ebay, '$.UNOPENED.approxSaleCount') AS approximate
      FROM poketrace_sealed_market_snapshots ORDER BY recorded_at
    `);
    assert.deepEqual(
      result.rows.map((row) => ({ ...row })),
      [
        {
          recorded_at: "2026-10-04",
          currency: "USD",
          source_updated_at: "2026-10-04T08:00:00.000Z",
          tcg_sales: 200,
          ebay_sales: 0,
          approximate: 1,
        },
        {
          recorded_at: "2026-10-05",
          currency: "USD",
          source_updated_at: "2026-10-05T08:00:00.000Z",
          tcg_sales: 205,
          ebay_sales: 0,
          approximate: 1,
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("sealed snapshots support eBay without a TCG price and preserve missing counts", async () => {
  const database = createClient({ url: ":memory:" });
  try {
    await migratePokeTraceDatabase(database);
    for (const [id, prices] of [
      ["ebay-only", { ebay: { UNOPENED: { saleCount: 42 } } }],
      ["missing-count", { tcgplayer: { UNOPENED: { avg: 120 } } }],
      ["null-count", { tcgplayer: { UNOPENED: { saleCount: null } } }],
      ["empty", { tcgplayer: { UNOPENED: {} } }],
      ["wrong-condition", { tcgplayer: { NEAR_MINT: { saleCount: 999 } } }],
    ] as const) {
      await database.batch(
        sealedProductAndDailyPriceUpserts(
          { ...product, id, prices },
          "2026-10-05",
        ),
        "write",
      );
    }
    const result = await database.execute(
      "SELECT product_id, tcg, ebay FROM poketrace_sealed_market_snapshots ORDER BY product_id",
    );
    assert.deepEqual(
      result.rows.map((row) => ({
        id: row.product_id,
        tcg: row.tcg === null ? null : JSON.parse(String(row.tcg)),
        ebay: row.ebay === null ? null : JSON.parse(String(row.ebay)),
      })),
      [
        { id: "ebay-only", tcg: null, ebay: { UNOPENED: { saleCount: 42 } } },
        { id: "missing-count", tcg: { UNOPENED: { avg: 120 } }, ebay: null },
        {
          id: "null-count",
          tcg: { UNOPENED: { saleCount: null } },
          ebay: null,
        },
      ],
    );
    await database.execute(
      expiredSealedMarketSnapshotsDelete("2026-11-14", 40),
    );
    assert.equal(
      (
        await database.execute(
          "SELECT COUNT(*) AS count FROM poketrace_sealed_market_snapshots",
        )
      ).rows[0].count,
      3,
    );
    await database.execute(
      expiredSealedMarketSnapshotsDelete("2026-11-15", 40),
    );
    assert.equal(
      (
        await database.execute(
          "SELECT COUNT(*) AS count FROM poketrace_sealed_market_snapshots",
        )
      ).rows[0].count,
      0,
    );
  } finally {
    database.close();
  }
});
