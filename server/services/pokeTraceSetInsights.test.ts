import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { loadPokeTraceSetSalesLeaders } from "./pokeTraceSetInsights.js";

function rawCard(
  prices: Record<string, { approxSaleCount?: boolean; saleCount: number }>,
) {
  return JSON.stringify({ prices: { tcgplayer: prices } });
}

test("queries current card data without sales history", async () => {
  let readyCalls = 0;
  const result = await loadPokeTraceSetSalesLeaders(" Base Set ", {
    database: {
      execute: async (statement: { args: unknown[]; sql: string }) => {
        assert.deepEqual(statement.args, ["Base Set"]);
        assert.match(statement.sql, /cards\.raw_json/);
        assert.doesNotMatch(statement.sql, /poketrace_market_snapshots/);
        return {
          rows: [
            {
              total_leader_id: "total-card",
            },
          ],
        };
      },
    } as never,
    ensureReady: async () => {
      readyCalls += 1;
    },
  });

  assert.equal(readyCalls, 1);
  assert.deepEqual(result, {
    total: { cardId: "total-card" },
  });
});

test("ranks summed current sales", async () => {
  const database = createClient({ url: "file::memory:" });
  try {
    await database.execute(
      "CREATE TABLE poketrace_cards (id TEXT PRIMARY KEY, set_name TEXT, raw_json TEXT)",
    );
    await database.batch(
      [
        {
          sql: "INSERT INTO poketrace_cards (id, set_name, raw_json) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)",
          args: [
            "most",
            "Base Set",
            rawCard({
              LIGHTLY_PLAYED: { approxSaleCount: true, saleCount: 5 },
              NEAR_MINT: { saleCount: 10 },
            }),
            "least",
            "Base Set",
            rawCard({ NEAR_MINT: { saleCount: 3 } }),
            "zero",
            "Base Set",
            rawCard({ NEAR_MINT: { saleCount: 0 } }),
            "other",
            "Other Set",
            rawCard({ NEAR_MINT: { saleCount: 100 } }),
          ],
        },
      ],
      "write",
    );

    const result = await loadPokeTraceSetSalesLeaders("base set", {
      database,
      ensureReady: async () => undefined,
    });

    assert.deepEqual(result, {
      total: { cardId: "most" },
    });
  } finally {
    database.close();
  }
});

test("allows a most-sold leader with zero recorded sales", async () => {
  const database = createClient({ url: "file::memory:" });
  try {
    await database.execute(
      "CREATE TABLE poketrace_cards (id TEXT PRIMARY KEY, set_name TEXT, raw_json TEXT)",
    );
    await database.execute({
      sql: "INSERT INTO poketrace_cards (id, set_name, raw_json) VALUES (?, ?, ?)",
      args: ["zero", "Base Set", rawCard({ NEAR_MINT: { saleCount: 0 } })],
    });

    const result = await loadPokeTraceSetSalesLeaders("Base Set", {
      database,
      ensureReady: async () => undefined,
    });

    assert.deepEqual(result.total, {
      cardId: "zero",
    });
  } finally {
    database.close();
  }
});
