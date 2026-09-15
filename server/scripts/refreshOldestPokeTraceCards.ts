import "dotenv/config";
import { pokeTraceDb, pokeTraceReady } from "../db/pokeTraceDb.js";
import {
  fetchPokeTraceCard,
  fetchPokeTracePage,
  PokeTraceDailyLimitError,
  PokeTraceHttpError,
  type PokeTraceCard,
} from "../services/pokeTraceApi.js";
import { savePokeTraceCards } from "../services/pokeTraceStore.js";
import {
  PokeTraceJobLockLostError,
  withPokeTraceJobLock,
} from "./pokeTraceJobLock.js";

const apiKey = process.env.POKETRACE_API_KEY?.trim();
if (!apiKey) {
  console.error("Set POKETRACE_API_KEY before refreshing cards");
  process.exit(1);
}

const limit = Number(process.argv[2] ?? "50");
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
  console.error("Refresh limit must be an integer between 1 and 5000");
  process.exit(1);
}

const requestGapMs = 2100;
let lastRequestAt = 0;
async function paced<T>(request: () => Promise<T>) {
  const waitMs = Math.max(0, requestGapMs - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
  return request();
}

try {
  await pokeTraceReady;
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    const result = await pokeTraceDb.execute({
      sql: "SELECT id, tcgplayer_id FROM poketrace_cards ORDER BY fetched_at, id LIMIT ?",
      args: [limit],
    });
    const rows = result.rows.map((row) => ({
      id: String(row.id),
      tcgplayerId: row.tcgplayer_id == null ? null : String(row.tcgplayer_id),
    }));
    let refreshed = 0;
    const withoutRef = rows.filter((row) => !row.tcgplayerId);
    const withRef = rows.filter((row) => row.tcgplayerId);

    for (let offset = 0; offset < withRef.length; offset += 20) {
      const group = withRef.slice(offset, offset + 20);
      const expected = new Set(group.map((row) => row.id));
      const tcgplayerIds = [...new Set(group.map((row) => row.tcgplayerId!))];
      const found = new Map<string, PokeTraceCard>();
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      let hasMore: boolean;
      do {
        const page = await paced(() =>
          fetchPokeTracePage(apiKey, {
            tcgplayer_ids: tcgplayerIds.join(","),
            ...(cursor ? { cursor } : {}),
          }),
        );
        for (const card of page.data) {
          if (expected.has(card.id)) found.set(card.id, card);
        }
        hasMore = page.pagination.hasMore;
        cursor = page.pagination.nextCursor;
        if (hasMore && cursor && seenCursors.has(cursor)) {
          throw new Error("PokeTrace repeated a pagination cursor");
        }
        if (hasMore && cursor) seenCursors.add(cursor);
      } while (hasMore);
      assertHeld();
      await savePokeTraceCards([...found.values()]);
      refreshed += found.size;
      // A changed/missing TCGPlayer reference can leave a card out of a lookup.
      withoutRef.push(...group.filter((row) => !found.has(row.id)));
    }

    for (const row of withoutRef) {
      try {
        const card = await paced(() => fetchPokeTraceCard(apiKey, row.id));
        assertHeld();
        await savePokeTraceCards([card]);
        refreshed += 1;
      } catch (error) {
        if (
          error instanceof PokeTraceJobLockLostError ||
          (error instanceof PokeTraceHttpError &&
            [401, 403, 429].includes(error.status))
        ) {
          throw error;
        }
        console.error(`Could not refresh ${row.id}:`, error);
        process.exitCode = 1;
      }
    }
    console.log(`Refreshed ${refreshed}/${rows.length} oldest PokeTrace cards`);
  });
  if (!acquired)
    console.log("PokeTrace maintenance job already running; refresh skipped");
} catch (error) {
  if (error instanceof PokeTraceDailyLimitError) {
    console.log(
      "PokeTrace daily quota exhausted; refresh paused after saved cards",
    );
  } else {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} finally {
  pokeTraceDb.close();
}
