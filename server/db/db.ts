import "dotenv/config";
import {
  createClient,
  type InStatement,
  type InValue,
  type TransactionMode,
} from "@libsql/client";
import { implicitLocalDatabaseError } from "./databaseTargetPolicy.js";
import { logError } from "../security/logging.js";

export type SqlValue = InValue;
export type SqlStatement = InStatement;

const databaseUrl = process.env.TURSO_DATABASE_URL?.trim();
const databaseTargetError = implicitLocalDatabaseError(databaseUrl);
if (databaseTargetError) {
  const error = new Error(databaseTargetError);
  logError("Database configuration failed", error);
  throw error;
}

export const db = createClient({
  url: databaseUrl!,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

export function closeDatabase(): void {
  db.close();
}

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
