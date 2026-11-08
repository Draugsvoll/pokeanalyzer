import "dotenv/config";
import { DEFAULT_POKETRACE_REQUEST_GAP_MS } from "../config/pokeTraceRequests.js";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import {
  fetchPokeTracePage,
  PokeTraceDailyLimitError,
} from "../services/pokeTraceApi.js";
import { cardAndDailyPriceUpserts } from "../services/pokeTraceStore.js";
import { generateAndSavePokeTraceCatalog } from "./pokeTraceCatalogGenerationJob.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";
import { getSafeErrorDetails } from "../security/logging.js";

const apiKey = process.env.POKETRACE_API_KEY?.trim();
if (!apiKey) {
  console.error("Set POKETRACE_API_KEY before importing cards");
  process.exit(1);
}
assertExplicitPokeTraceDatabaseTarget();

const targetArgument = process.argv[2] ?? "20";
const target = targetArgument === "all" ? Infinity : Number(targetArgument);
if (
  targetArgument !== "all" &&
  (!Number.isSafeInteger(target) || target < 20 || target % 20 !== 0)
) {
  console.error(
    "Import target must be 'all' or a multiple of 20 of at least 20",
  );
  process.exit(1);
}

const importName = "english-us-singles-v2";
const requestGapMs = Number(
  process.env.POKETRACE_REQUEST_GAP_MS ?? DEFAULT_POKETRACE_REQUEST_GAP_MS,
);
if (
  !Number.isSafeInteger(requestGapMs) ||
  requestGapMs < 0 ||
  requestGapMs > 60_000
) {
  throw new Error("POKETRACE_REQUEST_GAP_MS must be between 0 and 60000");
}

let operation = "initialize v2 database";
let savedCount = 0;

try {
  await ensurePokeTraceReady();
  operation = "acquire maintenance lock";
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    operation = "read import checkpoint from Turso";
    const progress = await pokeTraceDb.execute({
      sql: "SELECT next_cursor, imported_count, complete FROM poketrace_import_progress WHERE name = ?",
      args: [importName],
    });
    let cursor =
      progress.rows[0]?.next_cursor == null
        ? null
        : String(progress.rows[0].next_cursor);
    let count = Number(progress.rows[0]?.imported_count ?? 0);
    let complete = Number(progress.rows[0]?.complete ?? 0) === 1;
    savedCount = count;
    console.log(
      `Resuming catalogue import at ${savedCount} saved cards; request gap ${requestGapMs}ms`,
    );

    while (!complete && count < target) {
      operation = "fetch PokeTrace catalogue page";
      const page = await fetchPokeTracePage(apiKey, cursor ? { cursor } : {});
      operation = "verify maintenance lock";
      assertHeld();
      const nextCursor = page.pagination.nextCursor;
      if (page.pagination.hasMore && nextCursor === cursor) {
        throw new Error("PokeTrace repeated the same pagination cursor");
      }
      count += page.data.length;
      complete = !page.pagination.hasMore;
      operation = "save catalogue page and checkpoint to Turso";
      await pokeTraceDb.batch(
        [
          ...page.data.flatMap((card) =>
            cardAndDailyPriceUpserts(
              card,
              new Date().toISOString().slice(0, 10),
              new Date().toISOString(),
            ),
          ),
          {
            sql: `
            INSERT INTO poketrace_import_progress (name, next_cursor, imported_count, complete)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
              next_cursor = excluded.next_cursor,
              imported_count = excluded.imported_count,
              complete = excluded.complete
          `,
            args: [importName, nextCursor, count, complete ? 1 : 0],
          },
        ],
        "write",
      );
      savedCount = count;
      console.log(
        `Saved ${count} English US singles to the PokeTrace database`,
      );
      cursor = nextCursor;
      if (!complete && count < target) {
        await new Promise((resolve) => setTimeout(resolve, requestGapMs));
      }
    }
    if (complete) {
      operation = "publish generated catalogue to Turso";
      await generateAndSavePokeTraceCatalog(pokeTraceDb, assertHeld);
    }
    console.log(
      complete
        ? "PokeTrace catalogue exhausted"
        : `Import paused at ${count} cards`,
    );
    console.log("Browse /search");
    operation = "release maintenance lock";
  });
  if (!acquired)
    throw new Error(
      "PokeTrace maintenance job already running; import not started",
    );
} catch (error) {
  if (error instanceof PokeTraceDailyLimitError) {
    console.log(
      "PokeTrace daily quota exhausted; import paused at saved cursor",
    );
    process.exitCode = 1;
  } else {
    console.error("Catalogue import failed", {
      operation,
      savedCount,
      ...getSafeErrorDetails(error),
    });
    let cause = error instanceof Error ? error.cause : undefined;
    for (let depth = 0; cause instanceof Error && depth < 3; depth += 1) {
      console.error("Underlying error", getSafeErrorDetails(cause));
      cause = cause.cause;
    }
    process.exitCode = 1;
  }
} finally {
  pokeTraceDb.close();
}
