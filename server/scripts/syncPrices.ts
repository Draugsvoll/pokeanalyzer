import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  dbAll,
  dbBatch,
  dbExecute,
  dbGet,
  dbRun,
  type SqlStatement,
} from "../db/db.js";
import { logError } from "../security/logging.js";
import {
  getCardsPage,
  waitBetweenRequests,
  PAGE_SIZE,
} from "../services/pokemonTcgApi.js";
import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard.js";
import { cleanupPriceHistory } from "./cleanupPrices.js";
import {
  buildAcquireSyncLock,
  buildFullCardUpsert,
  buildPriceOnlyUpdate,
  buildReleaseSyncLock,
  buildRenewSyncLock,
  buildSnapshotUpsert,
  getCardColumns,
  getProviderPriceState,
  metadataSignature,
  parseStoredCard,
  preserveMissingCurrentPrices,
  preserveOmittedCardFields,
  sanitizeIncomingCard,
  SYNC_LOCK_TABLE_SQL,
  type JsonObject,
  type ProviderPriceStates,
} from "./syncCardHelpers.js";
import {
  exitCodeForSyncStatus,
  safeSyncErrorMessage,
  SYNC_RUN_STARTED_INDEX_SQL,
  SYNC_RUN_TABLE_SQL,
  validateCatalogCompletion,
  validateStrictApiPage,
  type SyncRunStatus,
  type SyncWarning,
} from "./syncRunPolicy.js";

const SYNC_NAME = "unified-card-sync";
const SYNC_LOCK_TTL_SECONDS = 15 * 60;
const WARNING_SAMPLE_SIZE = 10;

type StoredCardRow = {
  [key: string]: unknown;
  id: unknown;
  number: unknown;
  name: unknown;
  set_id: unknown;
  set_name: unknown;
  image_small: unknown;
  image_large: unknown;
  raw_json: unknown;
};

type IdRow = {
  [key: string]: unknown;
  id: unknown;
};

type CountRow = {
  [key: string]: unknown;
  count: unknown;
};

type WarningBucket = {
  count: number;
  samples: string[];
};

type WarningBuckets = {
  apiRetries: WarningBucket;
  missingCardmarket: WarningBucket;
  missingExistingCards: WarningBucket;
  missingTcgplayer: WarningBucket;
  skippedSnapshots: WarningBucket;
};

export type UnifiedSyncSummary = {
  dailySnapshotRows: number;
  expectedApiCards: number;
  fetchedCards: number;
  initialCards: number;
  insertedCards: number;
  metadataUpdates: number;
  missingExistingCards: number;
  pagesCommitted: number;
  priceOnlyUpdates: number;
  snapshotsWritten: number;
  uniqueCards: number;
  warningCount: number;
};

export type UnifiedSyncResult = {
  runId: string;
  status: "clean" | "warnings";
  summary: UnifiedSyncSummary;
  warnings: SyncWarning[];
};

type SyncContext = {
  recordedAt: string;
  summary: UnifiedSyncSummary;
  warningBuckets: WarningBuckets;
};

function makeWarningBucket(): WarningBucket {
  return { count: 0, samples: [] };
}

function makeWarningBuckets(): WarningBuckets {
  return {
    apiRetries: makeWarningBucket(),
    missingCardmarket: makeWarningBucket(),
    missingExistingCards: makeWarningBucket(),
    missingTcgplayer: makeWarningBucket(),
    skippedSnapshots: makeWarningBucket(),
  };
}

function makeSyncSummary(): UnifiedSyncSummary {
  return {
    dailySnapshotRows: 0,
    expectedApiCards: 0,
    fetchedCards: 0,
    initialCards: 0,
    insertedCards: 0,
    metadataUpdates: 0,
    missingExistingCards: 0,
    pagesCommitted: 0,
    priceOnlyUpdates: 0,
    snapshotsWritten: 0,
    uniqueCards: 0,
    warningCount: 0,
  };
}

function addWarning(
  bucket: WarningBucket,
  sample: string,
  amount = 1,
): void {
  bucket.count += amount;
  if (bucket.samples.length < WARNING_SAMPLE_SIZE) {
    bucket.samples.push(sample);
  }
}

function collectWarnings(buckets: WarningBuckets): SyncWarning[] {
  const definitions: Array<{
    bucket: WarningBucket;
    code: string;
    message: string;
  }> = [
    {
      bucket: buckets.apiRetries,
      code: "api_retries",
      message: "API requests required retries before succeeding",
    },
    {
      bucket: buckets.missingExistingCards,
      code: "missing_existing_cards",
      message:
        "Existing cards were not returned by the API and were left unchanged",
    },
    {
      bucket: buckets.missingTcgplayer,
      code: "missing_tcgplayer_prices",
      message:
        "Cards had no usable TCGplayer prices; prior current prices were preserved",
    },
    {
      bucket: buckets.missingCardmarket,
      code: "missing_cardmarket_prices",
      message:
        "Cards had no usable Cardmarket prices; prior current prices were preserved",
    },
    {
      bucket: buckets.skippedSnapshots,
      code: "skipped_snapshots",
      message:
        "Cards had neither provider price, so their daily snapshots were skipped",
    },
  ];

  return definitions.flatMap(({ bucket, code, message }) =>
    bucket.count > 0
      ? [{ code, count: bucket.count, message, samples: bucket.samples }]
      : [],
  );
}

function logWarnings(warnings: SyncWarning[]): void {
  for (const warning of warnings) {
    const samples =
      warning.samples.length > 0
        ? ` Samples: ${warning.samples.join(", ")}`
        : "";
    console.warn(
      `SYNC WARNING [${warning.code}]: ${warning.message}. Count: ${warning.count}.${samples}`,
    );
  }
}

function databaseText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function storedColumnsDiffer(
  row: StoredCardRow,
  incomingCard: PokemonTcgApiCard,
): boolean {
  const columns = getCardColumns(incomingCard);

  return (
    databaseText(row.number) !== columns.number ||
    databaseText(row.name) !== columns.name ||
    databaseText(row.set_id) !== columns.setId ||
    databaseText(row.set_name) !== columns.setName ||
    databaseText(row.image_small) !== columns.imageSmall ||
    databaseText(row.image_large) !== columns.imageLarge
  );
}

function getIncomingPriceStates(card: JsonObject): ProviderPriceStates {
  return {
    tcgplayer: getProviderPriceState(card, "tcgplayer"),
    cardmarket: getProviderPriceState(card, "cardmarket"),
  };
}

async function loadStoredCards(
  cardIds: string[],
): Promise<Map<string, StoredCardRow>> {
  if (cardIds.length === 0) return new Map();

  const rows = await dbAll<StoredCardRow>(
    `
    SELECT
      id,
      number,
      name,
      set_id,
      set_name,
      image_small,
      image_large,
      raw_json
    FROM cards
    WHERE id IN (SELECT CAST(value AS TEXT) FROM json_each(?))
    `,
    [JSON.stringify([...new Set(cardIds)])],
  );

  return new Map(rows.map((row) => [String(row.id), row]));
}

async function ensureOperationalTables(): Promise<void> {
  await dbExecute(SYNC_LOCK_TABLE_SQL);
  await dbExecute(SYNC_RUN_TABLE_SQL);
  await dbExecute(SYNC_RUN_STARTED_INDEX_SQL);
}

async function startSyncAudit(
  runId: string,
  recordedAt: string,
): Promise<void> {
  await dbExecute(
    `
    INSERT INTO sync_runs
      (id, sync_name, status, snapshot_date)
    VALUES (?, ?, 'running', ?)
    `,
    [runId, SYNC_NAME, recordedAt],
  );
}

async function markAbandonedSyncAudits(runId: string): Promise<void> {
  await dbRun(
    `
    UPDATE sync_runs
    SET
      status = 'failed',
      finished_at = CURRENT_TIMESTAMP,
      error_message = 'Previous process ended without finalizing its sync audit'
    WHERE status = 'running' AND id <> ?
    `,
    [runId],
  );
}

async function finishSyncAudit(
  runId: string,
  status: SyncRunStatus,
  summary: UnifiedSyncSummary,
  warnings: SyncWarning[],
  error: unknown = null,
): Promise<void> {
  const result = await dbRun(
    `
    UPDATE sync_runs
    SET
      status = ?,
      finished_at = CURRENT_TIMESTAMP,
      initial_cards = ?,
      expected_api_cards = ?,
      fetched_cards = ?,
      unique_cards = ?,
      pages_committed = ?,
      snapshots_written = ?,
      warning_count = ?,
      warnings_json = json(?),
      summary_json = json(?),
      error_message = ?
    WHERE id = ?
    `,
    [
      status,
      summary.initialCards,
      summary.expectedApiCards || null,
      summary.fetchedCards,
      summary.uniqueCards,
      summary.pagesCommitted,
      summary.snapshotsWritten,
      summary.warningCount,
      JSON.stringify(warnings),
      JSON.stringify(summary),
      error == null ? null : safeSyncErrorMessage(error),
      runId,
    ],
  );

  if (result.changes !== 1) {
    throw new Error(`Failed to finalize sync audit ${runId}`);
  }
}

async function acquireSyncLock(token: string): Promise<boolean> {
  const statement = buildAcquireSyncLock(
    SYNC_NAME,
    token,
    SYNC_LOCK_TTL_SECONDS,
  );
  const result = await dbExecute(statement.sql, statement.args);

  return result.rows.some((row) => String(row.token) === token);
}

async function renewSyncLock(token: string): Promise<void> {
  const statement = buildRenewSyncLock(
    SYNC_NAME,
    token,
    SYNC_LOCK_TTL_SECONDS,
  );
  const result = await dbRun(statement.sql, statement.args);

  if (result.changes !== 1) {
    throw new Error("The card sync lock was lost; stopping before more writes");
  }
}

async function releaseSyncLock(token: string): Promise<void> {
  const statement = buildReleaseSyncLock(SYNC_NAME, token);
  const result = await dbRun(statement.sql, statement.args);
  if (result.changes !== 1) {
    throw new Error("The card sync lock could not be released");
  }
}

async function verifyCommittedState(context: SyncContext): Promise<void> {
  const finalCardRow = await dbGet<CountRow>(
    "SELECT COUNT(*) AS count FROM cards",
  );
  const finalCardCount = Number(finalCardRow?.count);
  const expectedFinalCardCount =
    context.summary.initialCards + context.summary.insertedCards;
  if (finalCardCount !== expectedFinalCardCount) {
    throw new Error(
      `Final card-count verification failed: expected ${expectedFinalCardCount}, found ${finalCardCount}`,
    );
  }

  const snapshotRow = await dbGet<CountRow>(
    `
    SELECT COUNT(*) AS count
    FROM price_snapshots
    WHERE recorded_at = ?
    `,
    [context.recordedAt],
  );
  context.summary.dailySnapshotRows = Number(snapshotRow?.count);
  if (context.summary.dailySnapshotRows < context.summary.snapshotsWritten) {
    throw new Error(
      `Snapshot verification failed: wrote ${context.summary.snapshotsWritten}, found ${context.summary.dailySnapshotRows}`,
    );
  }
}

async function runLockedSync(
  token: string,
  context: SyncContext,
): Promise<void> {
  const initialRows = await dbAll<IdRow>("SELECT id FROM cards");
  const initialCardIds = new Set(initialRows.map((row) => String(row.id)));
  const seenCardIds = new Set<string>();
  context.summary.initialCards = initialCardIds.size;

  let expectedTotalCards: number | null = null;
  let page = 1;

  while (true) {
    await renewSyncLock(token);
    console.log(`Fetching card and price page ${page}`);

    const apiPage = await getCardsPage(page);
    expectedTotalCards = validateStrictApiPage(
      apiPage,
      page,
      expectedTotalCards,
    );
    context.summary.expectedApiCards = expectedTotalCards;
    if (apiPage.retryCount > 0) {
      addWarning(
        context.warningBuckets.apiRetries,
        `page ${page}`,
        apiPage.retryCount,
      );
    }

    // If a slow/retried request outlived our lease and another run took over,
    // this check stops the old process before it writes anything.
    await renewSyncLock(token);

    const cards = apiPage.data.map(sanitizeIncomingCard);
    for (const card of cards) {
      if (seenCardIds.has(card.id)) {
        throw new Error(
          `Card API returned duplicate card ID ${card.id}; refusing an incomplete/unstable catalog`,
        );
      }
      seenCardIds.add(card.id);
    }
    context.summary.uniqueCards = seenCardIds.size;

    const existingCards = await loadStoredCards(cards.map((card) => card.id));
    const statements: SqlStatement[] = [];
    const pageStats = {
      insertedCards: 0,
      metadataUpdates: 0,
      priceOnlyUpdates: 0,
      snapshotsWritten: 0,
    };

    for (const card of cards) {
      context.summary.fetchedCards += 1;

      const incomingJson = card as JsonObject;
      const priceStates = getIncomingPriceStates(incomingJson);
      if (!priceStates.tcgplayer.prices) {
        addWarning(context.warningBuckets.missingTcgplayer, card.id);
      }
      if (!priceStates.cardmarket.prices) {
        addWarning(context.warningBuckets.missingCardmarket, card.id);
      }

      const existingRow = existingCards.get(card.id);
      if (!existingRow) {
        statements.push(buildFullCardUpsert(card));
        pageStats.insertedCards += 1;
      } else {
        const existingJson = parseStoredCard(existingRow.raw_json, card.id);
        const cardWithSafeMetadata = preserveOmittedCardFields(
          card,
          existingJson,
        );
        const cardWithSafePrices = preserveMissingCurrentPrices(
          cardWithSafeMetadata,
          existingJson,
        );
        const metadataChanged =
          metadataSignature(existingJson) !==
            metadataSignature(cardWithSafePrices) ||
          storedColumnsDiffer(existingRow, card);

        if (metadataChanged) {
          statements.push(buildFullCardUpsert(cardWithSafePrices));
          pageStats.metadataUpdates += 1;
        } else {
          const priceUpdate = buildPriceOnlyUpdate(card.id, priceStates);
          if (priceUpdate) {
            statements.push(priceUpdate);
            pageStats.priceOnlyUpdates += 1;
          }
        }
      }

      const snapshot = buildSnapshotUpsert(
        card.id,
        priceStates,
        context.recordedAt,
      );
      if (snapshot) {
        statements.push(snapshot);
        pageStats.snapshotsWritten += 1;
      } else {
        addWarning(context.warningBuckets.skippedSnapshots, card.id);
      }
    }

    if (statements.length === 0) {
      throw new Error(`Page ${page} produced no database statements`);
    }

    // One complete API page is one transaction. If any statement fails, no
    // card or snapshot from this page is committed.
    await dbBatch(statements, "write");
    context.summary.insertedCards += pageStats.insertedCards;
    context.summary.metadataUpdates += pageStats.metadataUpdates;
    context.summary.priceOnlyUpdates += pageStats.priceOnlyUpdates;
    context.summary.snapshotsWritten += pageStats.snapshotsWritten;
    context.summary.pagesCommitted += 1;
    await renewSyncLock(token);
    console.log(
      `Committed page ${page}; processed ${context.summary.fetchedCards}/${expectedTotalCards} cards`,
    );

    if (context.summary.fetchedCards >= expectedTotalCards) break;

    page += 1;
    await waitBetweenRequests();
  }

  validateCatalogCompletion({
    expectedCards: expectedTotalCards,
    fetchedCards: context.summary.fetchedCards,
    pagesCommitted: context.summary.pagesCommitted,
    pageSize: PAGE_SIZE,
    uniqueCards: context.summary.uniqueCards,
  });

  const missingExistingIds = [...initialCardIds].filter(
    (cardId) => !seenCardIds.has(cardId),
  );
  context.summary.missingExistingCards = missingExistingIds.length;
  for (const cardId of missingExistingIds) {
    addWarning(context.warningBuckets.missingExistingCards, cardId);
  }

  await renewSyncLock(token);
  await cleanupPriceHistory();
  await renewSyncLock(token);
  await verifyCommittedState(context);
  await renewSyncLock(token);
}

/**
 * Fetch complete upstream cards, refresh current card data safely, and record
 * one daily price snapshot. Clean runs return normally; warning runs return
 * with status "warnings"; failures throw after their audit row is finalized.
 */
export async function runUnifiedCardSync(): Promise<UnifiedSyncResult> {
  await ensureOperationalTables();

  const runId = randomUUID();
  const token = randomUUID();
  const context: SyncContext = {
    recordedAt: new Date().toISOString().slice(0, 10),
    summary: makeSyncSummary(),
    warningBuckets: makeWarningBuckets(),
  };

  await startSyncAudit(runId, context.recordedAt);

  let acquired = false;
  let syncCompleted = false;
  let syncError: unknown;

  try {
    acquired = await acquireSyncLock(token);
    if (!acquired) {
      throw new Error(
        "Another card sync is already running; this run made no card changes",
      );
    }

    await markAbandonedSyncAudits(runId);
    await runLockedSync(token, context);
    syncCompleted = true;
  } catch (error) {
    syncError = error;
  }

  if (acquired) {
    try {
      await releaseSyncLock(token);
    } catch (releaseError) {
      if (syncError) {
        logError("Card sync also failed to release its lock", releaseError);
      } else {
        syncError = releaseError;
      }
    }
  }

  const warnings = collectWarnings(context.warningBuckets);
  context.summary.warningCount = warnings.reduce(
    (total, warning) => total + warning.count,
    0,
  );
  logWarnings(warnings);

  if (syncError) {
    const status: SyncRunStatus =
      !syncCompleted && context.summary.pagesCommitted > 0
        ? "partial_failure"
        : "failed";
    try {
      await finishSyncAudit(
        runId,
        status,
        context.summary,
        warnings,
        syncError,
      );
    } catch (auditError) {
      logError("Failed to record the card sync failure audit", auditError);
    }
    throw syncError;
  }

  const status: UnifiedSyncResult["status"] =
    warnings.length > 0 ? "warnings" : "clean";
  await finishSyncAudit(runId, status, context.summary, warnings);

  const result: UnifiedSyncResult = {
    runId,
    status,
    summary: context.summary,
    warnings,
  };
  console.log(
    `Unified card sync finished with status ${status}`,
    JSON.stringify(result),
  );
  return result;
}

function isDirectRun(): boolean {
  const entryPath = process.argv[1];
  return Boolean(
    entryPath &&
      pathToFileURL(path.resolve(entryPath)).href === import.meta.url,
  );
}

if (isDirectRun()) {
  void runUnifiedCardSync()
    .then((result) => {
      process.exitCode = exitCodeForSyncStatus(result.status);
    })
    .catch((error: unknown) => {
      logError("Unified card sync failed", error);
      process.exitCode = 1;
    });
}
