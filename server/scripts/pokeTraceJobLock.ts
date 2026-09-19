import { randomUUID } from "node:crypto";
import { pokeTraceDb } from "../db/pokeTraceDb.js";

const lockName = "poketrace-maintenance";
const leaseSeconds = 120;
const renewEveryMs = 30_000;

export class PokeTraceJobLockLostError extends Error {}

export async function withPokeTraceJobLock(
  work: (assertHeld: () => void) => Promise<void>,
  database = pokeTraceDb,
): Promise<boolean> {
  const token = randomUUID();
  const acquired = await database.execute({
    sql: `
      INSERT INTO poketrace_job_locks (name, token, expires_at)
      VALUES (?, ?, unixepoch('now') + ?)
      ON CONFLICT(name) DO UPDATE SET
        token = excluded.token,
        expires_at = excluded.expires_at
      WHERE poketrace_job_locks.expires_at <= unixepoch('now')
      RETURNING token
    `,
    args: [lockName, token, leaseSeconds],
  });
  if (acquired.rows.length === 0) return false;

  let lost: PokeTraceJobLockLostError | null = null;
  let renewal: Promise<void> | null = null;
  const assertHeld = () => {
    if (lost) throw lost;
  };
  const timer = setInterval(() => {
    if (renewal || lost) return;
    renewal = database
      .execute({
        sql: `
          UPDATE poketrace_job_locks
          SET expires_at = unixepoch('now') + ?
          WHERE name = ? AND token = ? AND expires_at > unixepoch('now')
        `,
        args: [leaseSeconds, lockName, token],
      })
      .then((result) => {
        if (result.rowsAffected !== 1) {
          lost = new PokeTraceJobLockLostError(
            "PokeTrace maintenance lock was lost",
          );
        }
      })
      .catch((error: unknown) => {
        lost = new PokeTraceJobLockLostError(
          `Could not renew PokeTrace maintenance lock: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        renewal = null;
      });
  }, renewEveryMs);

  try {
    await work(assertHeld);
    assertHeld();
  } finally {
    clearInterval(timer);
    if (renewal) await renewal;
    await database.execute({
      sql: "DELETE FROM poketrace_job_locks WHERE name = ? AND token = ?",
      args: [lockName, token],
    });
  }
  return true;
}
