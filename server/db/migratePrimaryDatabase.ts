import type { Client, Transaction } from "@libsql/client";
import { db } from "./db.js";
import { assertNewsContentSchemaCompatible } from "./newsStore.js";
import {
  PRIMARY_DATABASE_MIGRATIONS,
  type PrimaryDatabaseMigration,
} from "./primaryDatabaseMigrations.js";

type PrimaryMigrationDatabase = Pick<Client, "execute" | "transaction">;
type MigrationRow = { checksum: unknown; name: unknown; version: unknown };
type ExpectedPrimaryColumn = {
  defaultValue: string | null;
  name: string;
  notNull: boolean;
  primaryKeyPosition: number;
  type: string;
};
type ExpectedPrimaryTable = {
  columns: readonly ExpectedPrimaryColumn[];
  name: string;
  requiredSqlFragments: readonly string[];
};

const CREATE_MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS primary_schema_migrations (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    name TEXT NOT NULL UNIQUE,
    checksum TEXT NOT NULL CHECK (length(checksum) = 64),
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;
const TRANSACTION_RETRY_DELAYS_MS = [
  100, 250, 500, 1_000, 2_000, 4_000, 8_000,
] as const;
/** Keep this definition aligned with the latest primary migration. */
const EXPECTED_PRIMARY_TABLES = [
  {
    columns: [
      {
        defaultValue: null,
        name: "name",
        notNull: false,
        primaryKeyPosition: 1,
        type: "TEXT",
      },
      {
        defaultValue: null,
        name: "token",
        notNull: true,
        primaryKeyPosition: 0,
        type: "TEXT",
      },
      {
        defaultValue: "CURRENT_TIMESTAMP",
        name: "acquired_at",
        notNull: true,
        primaryKeyPosition: 0,
        type: "TEXT",
      },
      {
        defaultValue: null,
        name: "expires_at",
        notNull: true,
        primaryKeyPosition: 0,
        type: "INTEGER",
      },
    ],
    name: "sync_locks",
    requiredSqlFragments: [],
  },
  {
    columns: [
      {
        defaultValue: null,
        name: "feed",
        notNull: false,
        primaryKeyPosition: 1,
        type: "TEXT",
      },
      {
        defaultValue: null,
        name: "payload_json",
        notNull: true,
        primaryKeyPosition: 0,
        type: "TEXT",
      },
      {
        defaultValue: null,
        name: "source_date",
        notNull: false,
        primaryKeyPosition: 0,
        type: "TEXT",
      },
      {
        defaultValue: "CURRENT_TIMESTAMP",
        name: "updated_at",
        notNull: true,
        primaryKeyPosition: 0,
        type: "TEXT",
      },
    ],
    name: "news_content",
    requiredSqlFragments: [
      "check(feed='general_news')",
      "check(json_valid(payload_json))",
    ],
  },
] as const satisfies readonly ExpectedPrimaryTable[];

function isDatabaseBusy(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("SQLITE_BUSY")
  );
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function beginMigrationTransaction(
  database: PrimaryMigrationDatabase,
): Promise<Transaction> {
  for (const delayMs of TRANSACTION_RETRY_DELAYS_MS) {
    try {
      return await database.transaction("write");
    } catch (error) {
      if (!isDatabaseBusy(error)) throw error;
      await wait(delayMs);
    }
  }

  return database.transaction("write");
}

function validateMigrationDefinitions(
  migrations: readonly PrimaryDatabaseMigration[],
) {
  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1;
    if (
      migration.version !== expectedVersion ||
      !migration.name.trim() ||
      !/^[a-f\d]{64}$/.test(migration.checksum) ||
      !migration.sql.trim()
    ) {
      throw new Error(
        `Invalid primary database migration definition at version ${expectedVersion}`,
      );
    }
  });
}

function validateAppliedMigrations(
  rows: readonly MigrationRow[],
  migrations: readonly PrimaryDatabaseMigration[],
) {
  const migrationsByVersion = new Map(
    migrations.map((migration) => [migration.version, migration]),
  );

  rows.forEach((row, index) => {
    const version = Number(row.version);
    const expectedVersion = index + 1;
    if (version !== expectedVersion) {
      throw new Error(
        `Primary database migration history is not contiguous: expected version ${expectedVersion}, found ${version}`,
      );
    }

    const expected = migrationsByVersion.get(version);
    if (!expected) {
      throw new Error(
        `Primary database contains unknown migration version ${version}`,
      );
    }
    if (String(row.name) !== expected.name) {
      throw new Error(
        `Primary database migration ${version} does not match ${expected.name}`,
      );
    }
    if (String(row.checksum) !== expected.checksum) {
      throw new Error(
        `Primary database migration ${version} has been modified after being applied`,
      );
    }
  });
}

async function assertRequiredPrimarySchema(transaction: Transaction) {
  try {
    for (const table of EXPECTED_PRIMARY_TABLES) {
      const tableInfo = await transaction.execute(
        `PRAGMA table_info("${table.name}")`,
      );
      const actualColumns: ExpectedPrimaryColumn[] = tableInfo.rows.map(
        (row) => ({
          defaultValue:
            row.dflt_value === null
              ? null
              : String(row.dflt_value).toUpperCase(),
          name: String(row.name),
          notNull: Boolean(Number(row.notnull)),
          primaryKeyPosition: Number(row.pk),
          type: String(row.type).toUpperCase(),
        }),
      );
      if (JSON.stringify(actualColumns) !== JSON.stringify(table.columns)) {
        throw new Error(`${table.name} has an unexpected column definition`);
      }

      const schema = await transaction.execute({
        sql: `
          SELECT sql
          FROM sqlite_schema
          WHERE type = 'table' AND name = ?
        `,
        args: [table.name],
      });
      const normalizedSql = String(schema.rows[0]?.sql ?? "")
        .toLowerCase()
        .replace(/\s+/g, "");
      if (
        table.requiredSqlFragments.some(
          (requiredSql) => !normalizedSql.includes(requiredSql),
        )
      ) {
        throw new Error(`${table.name} is missing a required constraint`);
      }
    }
  } catch (error) {
    throw new Error(
      "Primary database schema is incompatible after applying migrations",
      { cause: error },
    );
  }
}

export async function migratePrimaryDatabase(
  database: PrimaryMigrationDatabase = db,
) {
  validateMigrationDefinitions(PRIMARY_DATABASE_MIGRATIONS);

  const transaction = await beginMigrationTransaction(database);
  try {
    await transaction.execute(CREATE_MIGRATION_TABLE_SQL);
    const appliedResult = await transaction.execute(`
      SELECT version, name, checksum
      FROM primary_schema_migrations
      ORDER BY version
    `);
    const appliedRows = appliedResult.rows as unknown as MigrationRow[];
    validateAppliedMigrations(appliedRows, PRIMARY_DATABASE_MIGRATIONS);
    const appliedVersions = new Set(
      appliedRows.map((row) => Number(row.version)),
    );
    let appliedMigration = false;

    for (const migration of PRIMARY_DATABASE_MIGRATIONS) {
      if (appliedVersions.has(migration.version)) continue;

      try {
        await transaction.executeMultiple(migration.sql);
        await transaction.execute({
          sql: `
            INSERT INTO primary_schema_migrations (version, name, checksum)
            VALUES (?, ?, ?)
          `,
          args: [migration.version, migration.name, migration.checksum],
        });
      } catch (error) {
        throw new Error(
          `Primary database migration ${migration.version} (${migration.name}) failed`,
          { cause: error },
        );
      }
      appliedMigration = true;
    }

    await assertRequiredPrimarySchema(transaction);
    if (appliedMigration) {
      await transaction.commit();
    } else {
      await transaction.rollback();
    }
  } finally {
    transaction.close();
  }

  await assertNewsContentSchemaCompatible(database);
}
