import path from "node:path";
import { pathToFileURL } from "node:url";
import { dbRun } from "../db/db.js";
import { logError } from "../security/logging.js";
import { PRICE_HISTORY_CLEANUP_SQL } from "./syncCardHelpers.js";

/**
 * Keep the rolling 30-day history, but never remove a card's newest snapshot.
 * A card missing from future API responses therefore keeps its last known
 * historical price indefinitely.
 */
export async function cleanupPriceHistory(): Promise<number> {
  const result = await dbRun(PRICE_HISTORY_CLEANUP_SQL);

  console.log(
    `Deleted ${result.changes} price snapshots older than 30 days; ` +
      "the newest snapshot for every card was preserved",
  );
  return result.changes;
}

function isDirectRun(): boolean {
  const entryPath = process.argv[1];
  return Boolean(
    entryPath &&
      pathToFileURL(path.resolve(entryPath)).href === import.meta.url,
  );
}

if (isDirectRun()) {
  void cleanupPriceHistory().catch((error: unknown) => {
    logError("Price cleanup failed", error);
    process.exitCode = 1;
  });
}
