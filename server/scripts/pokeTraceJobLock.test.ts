import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";

test("PokeTrace import and refresh cannot run at the same time", async () => {
  const database = createClient({ url: ":memory:" });
  try {
    await database.execute(`
      CREATE TABLE poketrace_job_locks (
        name TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    let runAgain: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      runAgain = resolve;
    });
    const first = withPokeTraceJobLock(async () => {
      await blocked;
    }, database);

    // Wait for the first job to acquire the lock before starting the second.
    for (;;) {
      const row = await database.execute(
        "SELECT token FROM poketrace_job_locks",
      );
      if (row.rows.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    assert.equal(await withPokeTraceJobLock(async () => {}, database), false);
    runAgain?.();
    assert.equal(await first, true);
    assert.equal(await withPokeTraceJobLock(async () => {}, database), true);
    await assert.rejects(
      withPokeTraceJobLock(async () => {
        throw new Error("daily quota reached");
      }, database),
      /daily quota reached/,
    );
    assert.equal(await withPokeTraceJobLock(async () => {}, database), true);
  } finally {
    database.close();
  }
});
