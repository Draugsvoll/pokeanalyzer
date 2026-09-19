import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import {
  fetchPokeTraceCard,
  fetchPokeTracePage,
  PokeTraceDailyLimitError,
  PokeTraceHttpError,
  type PokeTraceCard,
} from "../services/pokeTraceApi.js";
import {
  cardAndDailyPriceUpserts,
  cardRefreshFailureUpdate,
  expiredDailyPricesDelete,
} from "../services/pokeTraceStore.js";
import {
  loadOldestPokeTraceRefreshCandidates,
  type PokeTraceRefreshCandidate,
} from "../services/pokeTraceRefreshQueue.js";
import {
  PokeTraceJobLockLostError,
  withPokeTraceJobLock,
} from "./pokeTraceJobLock.js";

const apiKey = process.env.POKETRACE_API_KEY?.trim();
if (!apiKey) {
  console.error("Set POKETRACE_API_KEY before refreshing cards");
  process.exit(1);
}
assertExplicitPokeTraceDatabaseTarget();

function integerSetting(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    console.error(
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
    process.exit(1);
  }
  return parsed;
}

const limit = integerSetting(
  process.argv[2] ?? process.env.POKETRACE_DAILY_CARD_LIMIT,
  50_000,
  1,
  50_000,
  "Refresh limit",
);
const retentionDays = integerSetting(
  process.env.POKETRACE_PRICE_HISTORY_RETENTION_DAYS,
  40,
  31,
  730,
  "Price-history retention",
);
const requestGapMs = integerSetting(
  process.env.POKETRACE_REQUEST_GAP_MS,
  2_100,
  0,
  60_000,
  "PokeTrace request gap",
);
const recordedAt = new Date().toISOString().slice(0, 10);
let lastRequestAt = 0;

async function paced<T>(request: () => Promise<T>) {
  const waitMs = Math.max(0, requestGapMs - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
  return request();
}

function mustStop(error: unknown) {
  return (
    error instanceof PokeTraceJobLockLostError ||
    error instanceof PokeTraceDailyLimitError ||
    (error instanceof PokeTraceHttpError &&
      [401, 403, 429].includes(error.status))
  );
}

async function saveCards(cards: PokeTraceCard[]) {
  if (cards.length === 0) return;
  const refreshedAt = new Date().toISOString();
  await pokeTraceDb.batch(
    cards.flatMap((card) =>
      cardAndDailyPriceUpserts(card, recordedAt, refreshedAt),
    ),
    "write",
  );
}

async function deferCandidates(
  candidates: PokeTraceRefreshCandidate[],
  error: unknown,
) {
  if (candidates.length === 0) return;
  await pokeTraceDb.batch(
    candidates.map((candidate) =>
      cardRefreshFailureUpdate(candidate.id, candidate.failures),
    ),
    "write",
  );
  console.error(
    `Deferred ${candidates.length} PokeTrace card(s):`,
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
}

try {
  await ensurePokeTraceReady();
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    const rows = await loadOldestPokeTraceRefreshCandidates(pokeTraceDb, limit);
    let refreshed = 0;
    const withoutRef = rows.filter((row) => !row.tcgplayerId);
    const withRef = rows.filter((row) => row.tcgplayerId);

    for (let offset = 0; offset < withRef.length; offset += 20) {
      const group = withRef.slice(offset, offset + 20);
      const expected = new Set(group.map((row) => row.id));
      const tcgplayerIds = [...new Set(group.map((row) => row.tcgplayerId!))];
      const found = new Map<string, PokeTraceCard>();

      try {
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
        await saveCards([...found.values()]);
        refreshed += found.size;
        withoutRef.push(...group.filter((row) => !found.has(row.id)));
      } catch (error) {
        if (mustStop(error)) throw error;
        await deferCandidates(group, error);
      }
    }

    for (const row of withoutRef) {
      try {
        const card = await paced(() => fetchPokeTraceCard(apiKey, row.id));
        assertHeld();
        await saveCards([card]);
        refreshed += 1;
      } catch (error) {
        if (mustStop(error)) throw error;
        await deferCandidates([row], error);
      }
    }

    await pokeTraceDb.execute(
      expiredDailyPricesDelete(recordedAt, retentionDays),
    );
    console.log(
      `Refreshed ${refreshed}/${rows.length} oldest PokeTrace cards and saved ${recordedAt} prices`,
    );
  });

  if (!acquired) {
    console.log("PokeTrace maintenance job already running; refresh skipped");
  }
} catch (error) {
  if (error instanceof PokeTraceDailyLimitError) {
    console.error(
      `PokeTrace daily quota exhausted; oldest-card refresh stopped after saved ${recordedAt} prices`,
    );
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
} finally {
  pokeTraceDb.close();
}
