import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard.js";
import {
  exitCodeForSyncStatus,
  SYNC_RUN_TABLE_SQL,
  validateCatalogCompletion,
  validateStrictApiPage,
} from "./syncRunPolicy.js";

function cards(count: number): PokemonTcgApiCard[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `test-${index}`,
    name: `Card ${index}`,
  }));
}

test("strict catalog policy rejects empty, short, and changing API catalogs", () => {
  assert.throws(
    () =>
      validateStrictApiPage(
        {
          count: 0,
          data: [],
          page: 1,
          pageSize: 250,
          retryCount: 0,
          totalCount: 0,
        },
        1,
        null,
      ),
    /empty catalog/,
  );

  assert.throws(
    () =>
      validateStrictApiPage(
        {
          count: 249,
          data: cards(249),
          page: 1,
          pageSize: 250,
          retryCount: 0,
          totalCount: 300,
        },
        1,
        null,
      ),
    /incomplete/,
  );

  assert.throws(
    () =>
      validateStrictApiPage(
        {
          count: 50,
          data: cards(50),
          page: 2,
          pageSize: 250,
          retryCount: 0,
          totalCount: 301,
        },
        2,
        300,
      ),
    /totalCount changed/,
  );
});

test("strict catalog policy accepts only exact final totals", () => {
  const total = validateStrictApiPage(
    {
      count: 50,
      data: cards(50),
      page: 2,
      pageSize: 250,
      retryCount: 0,
      totalCount: 300,
    },
    2,
    300,
  );
  assert.equal(total, 300);

  assert.doesNotThrow(() =>
    validateCatalogCompletion({
      expectedCards: 300,
      fetchedCards: 300,
      pagesCommitted: 2,
      pageSize: 250,
      uniqueCards: 300,
    }),
  );
  assert.throws(
    () =>
      validateCatalogCompletion({
        expectedCards: 300,
        fetchedCards: 299,
        pagesCommitted: 2,
        pageSize: 250,
        uniqueCards: 299,
      }),
    /completeness validation failed/,
  );
});

test("warning runs use a nonzero process exit code", () => {
  assert.equal(exitCodeForSyncStatus("clean"), 0);
  assert.equal(exitCodeForSyncStatus("warnings"), 2);
  assert.equal(exitCodeForSyncStatus("failed"), 1);
  assert.equal(exitCodeForSyncStatus("partial_failure"), 1);
  assert.equal(exitCodeForSyncStatus("running"), 1);
});

test("sync audit schema persists strict run outcomes", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(SYNC_RUN_TABLE_SQL);
    await client.execute({
      sql: `
        INSERT INTO sync_runs
          (id, sync_name, status, snapshot_date)
        VALUES (?, ?, 'running', ?)
      `,
      args: ["run-1", "unified-card-sync", "2026-07-26"],
    });
    await client.execute({
      sql: `
        UPDATE sync_runs
        SET
          status = 'warnings',
          finished_at = CURRENT_TIMESTAMP,
          warning_count = 1,
          warnings_json = json(?)
        WHERE id = ?
      `,
      args: [
        JSON.stringify([
          {
            code: "api_retries",
            count: 1,
            message: "retry",
            samples: ["page 1"],
          },
        ]),
        "run-1",
      ],
    });

    const result = await client.execute(
      "SELECT status, warning_count, warnings_json FROM sync_runs",
    );
    assert.equal(result.rows[0]?.status, "warnings");
    assert.equal(result.rows[0]?.warning_count, 1);
    assert.equal(
      JSON.parse(String(result.rows[0]?.warnings_json))[0].code,
      "api_retries",
    );
  } finally {
    client.close();
  }
});
