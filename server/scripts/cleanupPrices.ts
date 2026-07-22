// sletter gamle prisdata intervaller så vi ikke får millioner av rows
import { dbRun } from "../db/db.js";
import { logError } from "../security/logging.js";

async function cleanupPrices(): Promise<void> {
  await dbRun(`
    DELETE FROM price_snapshots
    WHERE recorded_at < date('now', '-30 days')
  `);

  console.log("Deleted price snapshots older than 30 days");
}

cleanupPrices().catch((err: unknown) => {
  logError("Price cleanup failed", err);
});
