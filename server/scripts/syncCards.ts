import path from "node:path";
import { pathToFileURL } from "node:url";
import { logError } from "../security/logging.js";
import { runUnifiedCardSync } from "./syncPrices.js";
import { exitCodeForSyncStatus } from "./syncRunPolicy.js";

/**
 * Compatibility entry point for existing schedules. Card metadata and prices
 * are now intentionally synchronized together by the safe unified workflow.
 */
export async function syncCards() {
  console.warn(
    "syncCards is now an alias for the unified card/price sync. " +
      "Schedule only one of sync:cards or sync:prices, never both.",
  );
  return runUnifiedCardSync();
}

function isDirectRun(): boolean {
  const entryPath = process.argv[1];
  return Boolean(
    entryPath &&
      pathToFileURL(path.resolve(entryPath)).href === import.meta.url,
  );
}

if (isDirectRun()) {
  void syncCards()
    .then((result) => {
      process.exitCode = exitCodeForSyncStatus(result.status);
    })
    .catch((error: unknown) => {
      logError("Unified card sync failed through syncCards", error);
      process.exitCode = 1;
    });
}
