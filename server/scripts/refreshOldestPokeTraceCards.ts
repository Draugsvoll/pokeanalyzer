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
  type PokeTraceRetryEvent,
} from "../services/pokeTraceApi.js";
import {
  cardAndDailyPriceUpserts,
  cardRefreshFailureUpdate,
  dailyMarketSnapshotUpserts,
  dailyTcgMarketPriceUpserts,
  expiredDailyPricesDelete,
  expiredMarketSnapshotsDelete,
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

function integerSetting(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

let limit = 50_000;
let retentionDays = 40;
const marketSnapshotRetentionDays = 35;
let requestGapMs = 2_100;
const recordedAt = new Date().toISOString().slice(0, 10);
const startedAt = Date.now();
let lastRequestAt = 0;
let lastProgressLogged = 0;

type IssueCount = { events: number; cardIds: Set<string> };

const stats = {
  selected: 0,
  refreshed: 0,
  snapshots: 0,
  marketSnapshots: 0,
  withoutMarketPrice: 0,
  withoutTcgplayerRef: 0,
  batchFallbacks: 0,
  deferred: 0,
  retryAttempts: 0,
  retries: new Map<string, IssueCount>(),
  errors: new Map<string, IssueCount>(),
  fatalError: null as string | null,
};

function timestamp() {
  return new Date().toISOString();
}

function issueKind(message: string) {
  const httpStatus = message.match(/\bHTTP (\d{3})\b/i)?.[1];
  if (httpStatus) return `HTTP ${httpStatus}`;
  if (/burst rate limit/i.test(message)) return "Burst rate limit";
  if (/timeout|timed out|terminated|aborted/i.test(message)) {
    return "Request timeout/termination";
  }
  if (/fetch failed|econn|socket|network/i.test(message)) {
    return "Network error";
  }
  return null;
}

function errorDetails(error: unknown) {
  if (error instanceof PokeTraceHttpError) {
    return { kind: `HTTP ${error.status}`, message: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  const recognizedKind = issueKind(message);
  if (recognizedKind) return { kind: recognizedKind, message };
  return {
    kind: error instanceof Error ? error.name || "Error" : "Unknown error",
    message,
  };
}

function incrementIssue(
  target: Map<string, IssueCount>,
  kind: string,
  candidates: PokeTraceRefreshCandidate[],
) {
  const current = target.get(kind) ?? { events: 0, cardIds: new Set<string>() };
  current.events += 1;
  for (const candidate of candidates) current.cardIds.add(candidate.id);
  target.set(kind, current);
}

function cardList(candidates: PokeTraceRefreshCandidate[]) {
  const visible = candidates.slice(0, 20).map((candidate) => candidate.id);
  const remaining = candidates.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? ` (+${remaining} more)` : ""}`;
}

function logRetry(
  event: PokeTraceRetryEvent,
  candidates: PokeTraceRefreshCandidate[],
) {
  const kind = issueKind(event.reason) ?? "Temporary request error";
  stats.retryAttempts += 1;
  incrementIssue(stats.retries, kind, candidates);
  console.warn(
    `[WARNING ${timestamp()}] ${event.resource} failed: ${event.reason}`,
  );
  console.warn(
    `  Retry: ${event.attempt}/${event.maxAttempts} in ${event.delayMs}ms`,
  );
  console.warn(`  Cards (${candidates.length}): ${cardList(candidates)}`);
}

function printIssueSummary(label: string, issues: Map<string, IssueCount>) {
  console.log(`${label}: ${issues.size === 0 ? "none" : ""}`);
  for (const [kind, count] of issues) {
    console.log(
      `  - ${kind}: ${count.events} event(s), ${count.cardIds.size} affected card(s)`,
    );
  }
}

function logProgress(force = false) {
  if (
    !force &&
    stats.refreshed < stats.selected &&
    stats.refreshed - lastProgressLogged < 20
  ) {
    return;
  }
  if (!force && stats.refreshed === lastProgressLogged) return;
  console.log(
    `[PROGRESS ${timestamp()}] Refreshed ${stats.refreshed}/${stats.selected} oldest PokeTrace cards; snapshots ${stats.snapshots}; deferred ${stats.deferred}`,
  );
  lastProgressLogged = stats.refreshed;
}

function printSummary(result: string) {
  console.log("");
  console.log("=== PokeTrace refresh summary ===");
  console.log(`Result: ${result}`);
  console.log(`Date: ${recordedAt}`);
  console.log(`Selected: ${stats.selected}`);
  console.log(`Updated: ${stats.refreshed}`);
  console.log(`TCG market snapshots saved: ${stats.snapshots}`);
  console.log(`Additional market snapshots saved: ${stats.marketSnapshots}`);
  console.log(`Updated without TCG market price: ${stats.withoutMarketPrice}`);
  console.log(
    `Selected without TCGPlayer reference: ${stats.withoutTcgplayerRef}`,
  );
  console.log(
    `Individual fallbacks after incomplete batch: ${stats.batchFallbacks}`,
  );
  console.log(`Deferred for a later run: ${stats.deferred}`);
  console.log(`Retry attempts: ${stats.retryAttempts}`);
  printIssueSummary("Retries by cause", stats.retries);
  printIssueSummary("Deferred errors by cause", stats.errors);
  if (stats.fatalError) console.log(`Fatal error: ${stats.fatalError}`);
  console.log(`Duration: ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log("=================================");
}

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
  if (cards.length === 0) {
    return { cards: 0, marketSnapshots: 0, snapshots: 0 };
  }
  const refreshedAt = new Date().toISOString();
  const statements = cards.map((card) =>
    cardAndDailyPriceUpserts(card, recordedAt, refreshedAt),
  );
  await pokeTraceDb.batch(statements.flat(), "write");
  const snapshots = cards.filter(
    (card) => dailyTcgMarketPriceUpserts(card, recordedAt).length > 0,
  ).length;
  const marketSnapshots = cards.filter(
    (card) => dailyMarketSnapshotUpserts(card, recordedAt).length > 0,
  ).length;
  return { cards: cards.length, marketSnapshots, snapshots };
}

async function deferCandidates(
  candidates: PokeTraceRefreshCandidate[],
  error: unknown,
) {
  if (candidates.length === 0) return 0;
  await pokeTraceDb.batch(
    candidates.map((candidate) =>
      cardRefreshFailureUpdate(candidate.id, candidate.failures),
    ),
    "write",
  );
  const details = errorDetails(error);
  incrementIssue(stats.errors, details.kind, candidates);
  console.warn(
    `[WARNING ${timestamp()}] Deferred ${candidates.length} card(s): ${details.kind}`,
  );
  console.warn(`  Details: ${details.message}`);
  console.warn(`  Cards: ${cardList(candidates)}`);
  console.warn("  Action: retry scheduled with backoff");
  return candidates.length;
}

let result = "FAILED";
try {
  if (!apiKey) {
    throw new Error("Set POKETRACE_API_KEY before refreshing cards");
  }
  assertExplicitPokeTraceDatabaseTarget();
  limit = integerSetting(
    process.argv[2] ?? process.env.POKETRACE_DAILY_CARD_LIMIT,
    limit,
    1,
    50_000,
    "Refresh limit",
  );
  retentionDays = integerSetting(
    process.env.POKETRACE_PRICE_HISTORY_RETENTION_DAYS,
    retentionDays,
    31,
    730,
    "Price-history retention",
  );
  requestGapMs = integerSetting(
    process.env.POKETRACE_REQUEST_GAP_MS,
    requestGapMs,
    0,
    60_000,
    "PokeTrace request gap",
  );

  console.log("=== PokeTrace daily refresh started ===");
  console.log(`Date: ${recordedAt}`);
  console.log(`Maximum cards: ${limit}`);
  await ensurePokeTraceReady();
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    const rows = await loadOldestPokeTraceRefreshCandidates(pokeTraceDb, limit);
    stats.selected = rows.length;
    console.log(`Selected ${rows.length} oldest eligible card(s)`);
    const withoutRef = rows.filter((row) => !row.tcgplayerId);
    const withRef = rows.filter((row) => row.tcgplayerId);
    stats.withoutTcgplayerRef = withoutRef.length;
    if (withoutRef.length > 0) {
      console.warn(
        `[WARNING ${timestamp()}] ${withoutRef.length} selected card(s) have no TCGPlayer reference`,
      );
      console.warn(`  Cards: ${cardList(withoutRef)}`);
      console.warn("  Action: fetching each card directly by PokeTrace ID");
    }

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
            fetchPokeTracePage(
              apiKey,
              {
                tcgplayer_ids: tcgplayerIds.join(","),
                ...(cursor ? { cursor } : {}),
              },
              {
                onRetry: (event) => logRetry(event, group),
              },
            ),
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
        const saved = await saveCards([...found.values()]);
        stats.refreshed += saved.cards;
        stats.snapshots += saved.snapshots;
        stats.marketSnapshots += saved.marketSnapshots;
        stats.withoutMarketPrice += saved.cards - saved.snapshots;
        logProgress();
        const missing = group.filter((row) => !found.has(row.id));
        if (missing.length > 0) {
          stats.batchFallbacks += missing.length;
          console.warn(
            `[WARNING ${timestamp()}] Batch response omitted ${missing.length} expected card(s)`,
          );
          console.warn(`  Cards: ${cardList(missing)}`);
          console.warn("  Action: fetching each omitted card individually");
          withoutRef.push(...missing);
        }
      } catch (error) {
        if (mustStop(error)) throw error;
        stats.deferred += await deferCandidates(group, error);
      }
    }

    for (const row of withoutRef) {
      try {
        const card = await paced(() =>
          fetchPokeTraceCard(apiKey, row.id, {
            onRetry: (event) => logRetry(event, [row]),
          }),
        );
        assertHeld();
        const saved = await saveCards([card]);
        stats.refreshed += saved.cards;
        stats.snapshots += saved.snapshots;
        stats.marketSnapshots += saved.marketSnapshots;
        stats.withoutMarketPrice += saved.cards - saved.snapshots;
        logProgress();
      } catch (error) {
        if (mustStop(error)) throw error;
        stats.deferred += await deferCandidates([row], error);
      }
    }

    await pokeTraceDb.execute(
      expiredDailyPricesDelete(recordedAt, retentionDays),
    );
    await pokeTraceDb.execute(
      expiredMarketSnapshotsDelete(recordedAt, marketSnapshotRetentionDays),
    );
    logProgress(true);
    if (rows.length > 0 && stats.refreshed === 0 && stats.deferred > 0) {
      throw new Error(
        `PokeTrace refresh made no progress; deferred all ${stats.deferred} selected card(s)`,
      );
    }
    result = stats.deferred > 0 ? "PARTIAL SUCCESS" : "SUCCESS";
  });

  if (!acquired) {
    console.log("PokeTrace maintenance job already running; refresh skipped");
    result = "SKIPPED (job already running)";
  }
} catch (error) {
  const details = errorDetails(error);
  stats.fatalError = `${details.kind}: ${details.message}`;
  if (error instanceof PokeTraceDailyLimitError) {
    console.error(
      `[ERROR ${timestamp()}] PokeTrace daily quota exhausted; refresh stopped after preserving all completed updates`,
    );
  } else {
    console.error(`[ERROR ${timestamp()}] ${details.kind}: ${details.message}`);
  }
  console.error("  Action: job stopped and will exit with an error status");
  process.exitCode = 1;
} finally {
  printSummary(result);
  pokeTraceDb.close();
}
