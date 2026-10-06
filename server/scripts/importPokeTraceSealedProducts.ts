import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { PokeTraceDailyLimitError } from "../services/pokeTraceApi.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";
import {
  importPokeTraceSealedProducts,
  type PokeTraceSealedImportCheckpoint,
} from "./pokeTraceSealedImportJob.js";

let lastCheckpoint: PokeTraceSealedImportCheckpoint | undefined;

function importTarget(argument: string | undefined) {
  if (!argument || argument === "all") return Infinity;
  const target = Number(argument);
  if (!Number.isSafeInteger(target) || target < 20 || target % 20 !== 0) {
    throw new Error(
      "Sealed import target must be 'all' or a multiple of 20 of at least 20",
    );
  }
  return target;
}

try {
  const apiKey = process.env.POKETRACE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Set POKETRACE_API_KEY before importing sealed products");
  }
  assertExplicitPokeTraceDatabaseTarget();
  const target = importTarget(process.argv[2]);

  await ensurePokeTraceReady();
  let result:
    Awaited<ReturnType<typeof importPokeTraceSealedProducts>> | undefined;
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    result = await importPokeTraceSealedProducts(
      apiKey,
      assertHeld,
      {
        database: pokeTraceDb,
        onCheckpoint: (checkpoint) => {
          lastCheckpoint = checkpoint;
        },
      },
      target,
    );
  });
  if (!acquired) {
    throw new Error(
      "PokeTrace maintenance job already running; sealed import not started",
    );
  }
  if (!result) throw new Error("Sealed import did not return a result");

  console.log(
    result.complete
      ? `PokeTrace sealed catalogue exhausted; ${result.storedCount} products stored and ${result.removedProducts} obsolete products removed`
      : `Sealed import paused at ${result.importedCount} products; next cursor ${result.nextCursor}`,
  );
} catch (error) {
  if (error instanceof PokeTraceDailyLimitError) {
    console.error(
      "PokeTrace daily quota exhausted; sealed import paused at its saved cursor",
    );
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  if (lastCheckpoint) {
    const position = lastCheckpoint.finalized
      ? "crawl finalized"
      : lastCheckpoint.complete
        ? "all pages received, finalization did not complete"
        : lastCheckpoint.nextCursor
          ? `next cursor ${lastCheckpoint.nextCursor}`
          : "no page committed";
    console.error(
      `Last committed checkpoint: ${lastCheckpoint.importedCount} products; ${position}`,
    );
  }
  process.exitCode = 1;
} finally {
  pokeTraceDb.close();
}
