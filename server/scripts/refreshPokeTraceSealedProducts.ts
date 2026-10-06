import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { PokeTraceDailyLimitError } from "../services/pokeTraceApi.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";
import {
  refreshPokeTraceSealedProducts,
  type PokeTraceSealedRefreshCheckpoint,
} from "./pokeTraceSealedRefreshJob.js";

let result = "FAILED";
let lastCheckpoint: PokeTraceSealedRefreshCheckpoint | undefined;

try {
  const apiKey = process.env.POKETRACE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Set POKETRACE_API_KEY before refreshing sealed products");
  }
  assertExplicitPokeTraceDatabaseTarget();
  await ensurePokeTraceReady();

  let summary:
    Awaited<ReturnType<typeof refreshPokeTraceSealedProducts>> | undefined;
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    summary = await refreshPokeTraceSealedProducts(
      apiKey,
      new Date().toISOString().slice(0, 10),
      assertHeld,
      {
        database: pokeTraceDb,
        onCheckpoint: (checkpoint) => {
          lastCheckpoint = checkpoint;
        },
      },
    );
  });
  if (!acquired) {
    throw new Error(
      "PokeTrace maintenance lock is already held; sealed refresh not started",
    );
  }
  if (!summary) throw new Error("Sealed refresh did not return a result");

  result = "SUCCESS";
  console.log(
    `Sealed refresh saved ${summary.products} products and ${summary.snapshots} price snapshots; removed ${summary.removedProducts} obsolete products`,
  );
} catch (error) {
  if (error instanceof PokeTraceDailyLimitError) {
    console.error("Sealed refresh failed: PokeTrace daily quota exhausted");
  } else {
    console.error(
      `Sealed refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (lastCheckpoint) {
    const position = lastCheckpoint.complete
      ? "all pages received, finalization did not complete"
      : lastCheckpoint.nextCursor
        ? `next cursor ${lastCheckpoint.nextCursor}`
        : "no page committed";
    console.error(
      `Last committed checkpoint: ${lastCheckpoint.pages} page(s), ${lastCheckpoint.products} products, ${lastCheckpoint.snapshots} snapshots; ${position}`,
    );
  }
  process.exitCode = 1;
} finally {
  console.log(`Result: ${result}`);
  pokeTraceDb.close();
}
