import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import {
  fetchPokeTracePage,
  PokeTraceDailyLimitError,
} from "../services/pokeTraceApi.js";
import { cardUpsert } from "../services/pokeTraceStore.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";

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

const importName = "english-us-singles";
const requestGapMs = 2100; // Safe for the free tier's one-request-per-two-seconds burst limit.

try {
  await ensurePokeTraceReady();
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
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

    while (!complete && count < target) {
      const page = await fetchPokeTracePage(apiKey, cursor ? { cursor } : {});
      assertHeld();
      const nextCursor = page.pagination.nextCursor;
      if (page.pagination.hasMore && nextCursor === cursor) {
        throw new Error("PokeTrace repeated the same pagination cursor");
      }
      count += page.data.length;
      complete = !page.pagination.hasMore;
      await pokeTraceDb.batch(
        [
          ...page.data.map((card) => cardUpsert(card)),
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
      console.log(
        `Saved ${count} English US singles to the PokeTrace database`,
      );
      cursor = nextCursor;
      if (!complete && count < target) {
        await new Promise((resolve) => setTimeout(resolve, requestGapMs));
      }
    }
    console.log(
      complete
        ? "PokeTrace catalogue exhausted"
        : `Import paused at ${count} cards`,
    );
    console.log("Browse /search");
  });
  if (!acquired)
    console.log("PokeTrace maintenance job already running; import skipped");
} catch (error) {
  if (error instanceof PokeTraceDailyLimitError) {
    console.log(
      "PokeTrace daily quota exhausted; import paused at saved cursor",
    );
  } else {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} finally {
  pokeTraceDb.close();
}
