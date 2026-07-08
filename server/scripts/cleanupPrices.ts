// sletter gamle prisdata intervaller så vi ikke får millioner av rows
import { db } from "../db/db.js";

function run(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function cleanupPrices(): Promise<void> {
  await run(`
    DELETE FROM price_snapshots
    WHERE recorded_at < date('now', '-30 days')
  `);

  console.log("Deleted price snapshots older than 30 days");
}

cleanupPrices().catch((err: unknown) => {
  console.error("Price cleanup failed:", err);
});