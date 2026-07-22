import "dotenv/config";
import path from "path";
import { createClient, type InValue } from "@libsql/client";
import { logError } from "../security/logging.js";

export type SqlValue = InValue;

/** Local file fallback when TURSO_DATABASE_URL is not set. */
const localFileUrl = `file:${path.resolve("server/db/pokemon.sqlite")}`;

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL || localFileUrl,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

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

/** Split schema SQL into individual statements for libsql execute. */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
