import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migratePokeTraceDatabase } from "../db/pokeTraceDb.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";
import { copyMarketSnapshots } from "./copyMarketSnapshotsJob.js";

test("snapshot copy excludes card content, preserves newer target rows, and ignores the source lock", async () => {
  const source = createClient({ url: "file::memory:" });
  const target = createClient({ url: "file::memory:" });
  try {
    await migratePokeTraceDatabase(source);
    await migratePokeTraceDatabase(target);
    await source.execute(
      "INSERT INTO poketrace_cards (id, name, raw_json, saved_responses) VALUES ('private', 'Card', '{}', '{\"analysis\":\"never copy\"}')",
    );
    await source.execute(
      "INSERT INTO poketrace_job_locks VALUES ('poketrace-maintenance', 'v1-job', unixepoch('now') + 3600)",
    );
    await source.execute(
      "INSERT INTO poketrace_tcg_market_prices (card_id, recorded_at, market_price) VALUES ('a', '2026-11-01', 10), ('b', '2026-11-01', 20)",
    );
    await target.execute(
      "INSERT INTO poketrace_tcg_market_prices (card_id, recorded_at, market_price) VALUES ('a', '2026-11-01', 99)",
    );
    for (let run = 0; run < 2; run++) {
      assert.equal(
        await withPokeTraceJobLock(
          (held) => copyMarketSnapshots(source, target, held, () => {}),
          target,
        ),
        true,
      );
    }
    const prices = await target.execute(
      "SELECT card_id, market_price FROM poketrace_tcg_market_prices ORDER BY card_id",
    );
    assert.deepEqual(
      prices.rows.map((row) => ({ ...row })),
      [
        { card_id: "a", market_price: 99 },
        { card_id: "b", market_price: 20 },
      ],
    );
    assert.equal(
      (await target.execute("SELECT COUNT(*) AS total FROM poketrace_cards"))
        .rows[0].total,
      0,
    );
    assert.equal(
      (await source.execute("SELECT saved_responses FROM poketrace_cards"))
        .rows[0].saved_responses,
      '{"analysis":"never copy"}',
    );
    assert.equal(
      (
        await source.execute(
          "SELECT COUNT(*) AS total FROM poketrace_job_locks",
        )
      ).rows[0].total,
      1,
    );
    assert.equal(
      (
        await target.execute(
          "SELECT COUNT(*) AS total FROM poketrace_job_locks",
        )
      ).rows[0].total,
      0,
    );
  } finally {
    source.close();
    target.close();
  }
});
