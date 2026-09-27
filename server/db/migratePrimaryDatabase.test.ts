import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createClient, type Client } from "@libsql/client";
import { migratePrimaryDatabase } from "./migratePrimaryDatabase.js";
import { PRIMARY_DATABASE_MIGRATIONS } from "./primaryDatabaseMigrations.js";

const temporaryDirectory = path.join(
  tmpdir(),
  "pokelyzer-primary-migration-tests",
);
rmSync(temporaryDirectory, { force: true, recursive: true });
mkdirSync(temporaryDirectory, { recursive: true });

function createTestDatabase(name: string) {
  return createClient({
    url: `file:${path.join(temporaryDirectory, `${name}.sqlite`)}`,
  });
}

async function appliedMigrations(database: Client) {
  const table = await database.execute(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'primary_schema_migrations'
  `);
  if (table.rows.length === 0) return [];

  const result = await database.execute(`
    SELECT version, name, checksum
    FROM primary_schema_migrations
    ORDER BY version
  `);
  return result.rows.map((row) => ({
    checksum: String(row.checksum),
    name: String(row.name),
    version: Number(row.version),
  }));
}

async function assertPrimaryMigrationsApplied(database: Client) {
  const migrations = await appliedMigrations(database);
  assert.equal(migrations.length, 2);
  assert.deepEqual(
    migrations.map(({ name, version }) => ({ name, version })),
    [
      { name: "initial_schema", version: 1 },
      { name: "remove_legacy_news_feed", version: 2 },
    ],
  );
  for (const migration of migrations) {
    assert.match(migration.checksum, /^[a-f\d]{64}$/);
  }
}

test("primary migrations initialize a fresh database and are idempotent", async () => {
  const database = createTestDatabase("fresh");

  try {
    await migratePrimaryDatabase(database);
    await migratePrimaryDatabase(database);

    await assertPrimaryMigrationsApplied(database);
    const tables = await database.execute(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `);
    assert.deepEqual(
      tables.rows.map((row) => row.name),
      ["news_content", "primary_schema_migrations", "sync_locks"],
    );
  } finally {
    database.close();
  }
});

test("primary migrations baseline an existing compatible database", async () => {
  const database = createTestDatabase("existing");

  try {
    await database.executeMultiple(PRIMARY_DATABASE_MIGRATIONS[0].sql);
    await database.execute(`
      INSERT INTO news_content (feed, payload_json, source_date)
      VALUES ('general_news', '{}', '2026-09-27')
    `);
    await database.execute(`
      INSERT INTO news_content (feed, payload_json, source_date)
      VALUES ('biggest_movers', '{}', '2026-08-23')
    `);

    await migratePrimaryDatabase(database);

    await assertPrimaryMigrationsApplied(database);
    const preserved = await database.execute(`
      SELECT feed, source_date
      FROM news_content
      ORDER BY feed
    `);
    assert.deepEqual(
      preserved.rows.map((row) => ({
        feed: row.feed,
        sourceDate: row.source_date,
      })),
      [{ feed: "general_news", sourceDate: "2026-09-27" }],
    );
  } finally {
    database.close();
  }
});

test("primary migrations rebuild an existing schema with missing constraints", async () => {
  const database = createTestDatabase("constraint-repair");

  try {
    await database.execute(`
      CREATE TABLE news_content (
        feed TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        source_date TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await migratePrimaryDatabase(database);

    await assertPrimaryMigrationsApplied(database);
    await assert.rejects(
      database.execute(`
        INSERT INTO news_content (feed, payload_json)
        VALUES ('biggest_movers', '{}')
      `),
      /constraint/i,
    );
  } finally {
    database.close();
  }
});

test("primary migrations reject an altered applied migration", async () => {
  const database = createTestDatabase("altered");

  try {
    await migratePrimaryDatabase(database);
    await database.execute(`
      UPDATE primary_schema_migrations
      SET checksum = '${"0".repeat(64)}'
      WHERE version = 1
    `);

    await assert.rejects(
      migratePrimaryDatabase(database),
      /has been modified after being applied/,
    );
  } finally {
    database.close();
  }
});

test("primary migrations reject a non-contiguous migration history", async () => {
  const database = createTestDatabase("history-gap");

  try {
    await migratePrimaryDatabase(database);
    await database.execute(`
      UPDATE primary_schema_migrations
      SET version = 3
      WHERE version = 1
    `);

    await assert.rejects(
      migratePrimaryDatabase(database),
      /history is not contiguous: expected version 1, found 2/,
    );
  } finally {
    database.close();
  }
});

test("a failed migration does not record its version", async () => {
  const database = createTestDatabase("failed");

  try {
    await database.execute("CREATE TABLE news_content (feed TEXT PRIMARY KEY)");

    await assert.rejects(
      migratePrimaryDatabase(database),
      /migration 2 \(remove_legacy_news_feed\) failed/,
    );

    assert.deepEqual(await appliedMigrations(database), []);
    const syncLocks = await database.execute(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'sync_locks'
    `);
    assert.equal(syncLocks.rows.length, 0);
  } finally {
    database.close();
  }
});

test("concurrent primary migration runners serialize safely", async () => {
  const databasePath = path.join(temporaryDirectory, "concurrent.sqlite");
  const first = createClient({ url: `file:${databasePath}` });
  const second = createClient({ url: `file:${databasePath}` });

  try {
    await Promise.all([
      migratePrimaryDatabase(first),
      migratePrimaryDatabase(second),
    ]);

    await assertPrimaryMigrationsApplied(first);
  } finally {
    first.close();
    second.close();
  }
});
