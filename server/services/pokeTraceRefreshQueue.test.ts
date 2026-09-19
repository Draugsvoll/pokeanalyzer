import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { loadOldestPokeTraceRefreshCandidates } from "./pokeTraceRefreshQueue.js";

test("refresh queue selects eligible cards with the oldest successful refresh first", async () => {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_cards (
      id TEXT PRIMARY KEY,
      tcgplayer_id TEXT,
      price_refreshed_at TEXT,
      price_refresh_retry_at TEXT,
      price_refresh_failures INTEGER NOT NULL DEFAULT 0
    )
  `);
  await database.batch(
    [
      ["never-refreshed", null, null, null, 0],
      ["oldest", "101", "2026-09-14T08:00:00.000Z", null, 0],
      [
        "retry-ready",
        "102",
        "2026-09-15T08:00:00.000Z",
        "2026-09-17T08:00:00.000Z",
        2,
      ],
      ["newest", "103", "2026-09-16T08:00:00.000Z", null, 0],
      [
        "retry-later",
        "104",
        "2026-09-13T08:00:00.000Z",
        "2026-09-17T10:00:00.000Z",
        1,
      ],
      ["already-today", "105", "2026-09-17T07:00:00.000Z", null, 0],
    ].map((args) => ({
      sql: `
        INSERT INTO poketrace_cards
          (id, tcgplayer_id, price_refreshed_at, price_refresh_retry_at,
           price_refresh_failures)
        VALUES (?, ?, ?, ?, ?)
      `,
      args,
    })),
    "write",
  );

  const candidates = await loadOldestPokeTraceRefreshCandidates(
    database,
    4,
    "2026-09-17T09:00:00.000Z",
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ["never-refreshed", "oldest", "retry-ready", "newest"],
  );
  assert.equal(candidates[2]?.failures, 2);
  database.close();
});
