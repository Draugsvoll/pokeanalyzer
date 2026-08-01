import { dbExecute, dbRun } from "../db/db.js";

export const SCRIPT_LOCK_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sync_locks (
    name TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER NOT NULL
  )
`;

export const SCHEDULED_MAINTENANCE_LOCK_NAME = "scheduled-maintenance";

export type ScriptLock = {
  name: string;
  token: string;
};

export type ScriptLockStatement = {
  sql: string;
  args: Array<string | number>;
};

export async function ensureScriptLockTable(): Promise<void> {
  await dbExecute(SCRIPT_LOCK_TABLE_SQL);
}

export function buildAcquireScriptLock(
  name: string,
  token: string,
  ttlSeconds: number,
): ScriptLockStatement {
  return {
    sql: `
      INSERT INTO sync_locks (name, token, acquired_at, expires_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, unixepoch('now') + ?)
      ON CONFLICT(name) DO UPDATE SET
        token = excluded.token,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
      WHERE sync_locks.expires_at <= unixepoch('now')
      RETURNING token
    `,
    args: [name, token, ttlSeconds],
  };
}

export async function acquireScriptLock(
  name: string,
  token: string,
  ttlSeconds: number,
): Promise<boolean> {
  const statement = buildAcquireScriptLock(name, token, ttlSeconds);
  const result = await dbExecute(statement.sql, statement.args);
  return result.rows.some((row) => String(row.token) === token);
}

export async function renewScriptLock(
  name: string,
  token: string,
  ttlSeconds: number,
): Promise<boolean> {
  const statement = buildRenewScriptLock(name, token, ttlSeconds);
  const result = await dbRun(statement.sql, statement.args);
  return result.changes === 1;
}

export function buildRenewScriptLock(
  name: string,
  token: string,
  ttlSeconds: number,
): ScriptLockStatement {
  return {
    sql: `
      UPDATE sync_locks
      SET expires_at = unixepoch('now') + ?
      WHERE name = ? AND token = ?
    `,
    args: [ttlSeconds, name, token],
  };
}

export async function releaseScriptLock({
  name,
  token,
}: ScriptLock): Promise<boolean> {
  const result = await dbRun(
    "DELETE FROM sync_locks WHERE name = ? AND token = ?",
    [name, token],
  );
  return result.changes === 1;
}
