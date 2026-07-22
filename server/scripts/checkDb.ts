// npx tsx server/scripts/checkDb.ts
import { dbGet } from "../db/db.js";
import { logError } from "../security/logging.js";

async function checkDb() {
  try {
    const cards = await dbGet<{ count: number | bigint }>(
      "SELECT COUNT(*) AS count FROM cards",
    );
    console.log(`Cards: ${cards?.count ?? 0}`);

    const prices = await dbGet<{ count: number | bigint }>(
      "SELECT COUNT(*) AS count FROM price_snapshots",
    );
    console.log(`Price snapshots: ${prices?.count ?? 0}`);
  } catch (err) {
    logError("Failed to check database", err);
    process.exitCode = 1;
  }
}

void checkDb();
