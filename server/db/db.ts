import "dotenv/config";
import path from "path";
import {
  createClient,
  type InStatement,
  type InValue,
  type TransactionMode,
} from "@libsql/client";
import { logError } from "../security/logging.js";
import { implicitLocalDatabaseError } from "./databaseTargetPolicy.js";

export type SqlValue = InValue;
export type SqlStatement = InStatement;

/** Local file fallback when TURSO_DATABASE_URL is not set. */
const localFileUrl = `file:${path.resolve("server/db/pokemon.sqlite")}`;

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL || localFileUrl,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

export function closeDatabase(): void {
  db.close();
}

export function assertExplicitDatabaseTarget(): void {
  const error = implicitLocalDatabaseError(
    process.env.TURSO_DATABASE_URL,
    process.env.ALLOW_LOCAL_DATABASE,
  );
  if (error) throw new Error(error);
}

void (async () => {
  try {
    await db.execute("SELECT 1");
    console.log("Database connected successfully");
  } catch (err) {
    logError("Database connection failed", err);
  }
})();

export async function dbExecute(sql: string, args: SqlValue[] = []) {
  return db.execute({ sql, args });
}

export async function dbGet<T extends Record<string, unknown>>(
  sql: string,
  args: SqlValue[] = [],
): Promise<T | undefined> {
  const result = await db.execute({ sql, args });
  const row = result.rows[0];
  return row ? (row as unknown as T) : undefined;
}

export async function dbAll<T extends Record<string, unknown>>(
  sql: string,
  args: SqlValue[] = [],
): Promise<T[]> {
  const result = await db.execute({ sql, args });
  return result.rows as unknown as T[];
}

export async function dbRun(sql: string, args: SqlValue[] = []) {
  const result = await db.execute({ sql, args });
  return {
    changes: Number(result.rowsAffected),
    lastInsertRowid: result.lastInsertRowid,
  };
}

/**
 * Execute a group of statements in one libSQL transaction.
 * Any failed statement rolls back the complete batch.
 */
export async function dbBatch(
  statements: SqlStatement[],
  mode: TransactionMode = "write",
) {
  return db.batch(statements, mode);
}

/** Split schema SQL into individual statements for libsql execute. */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
