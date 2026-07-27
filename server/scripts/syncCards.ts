import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertExplicitDatabaseTarget,
  dbAll,
  dbBatch,
  dbExecute,
  dbGet,
  dbRun,
  type SqlStatement,
} from "../db/db.js";
import { assertDatabaseSchemaCompatible } from "../db/schemaValidation.js";
import { logError } from "../security/logging.js";
import {
  getCardsPage,
  PAGE_SIZE,
  waitBetweenRequests,
} from "../services/pokemonTcgApi.js";
import {
  APPLY_CARDMARKET_PRICE_UPDATES_SQL,
  APPLY_DAILY_SNAPSHOTS_SQL,
  APPLY_METADATA_UPDATES_SQL,
  APPLY_TCGPLAYER_PRICE_UPDATES_SQL,
  buildAcquireSyncLock,
  buildReleaseSyncLock,
  buildRenewSyncLock,
  buildSafeFullCard,
  buildStageCardStatement,
  CARD_APPLY_MISMATCH_COUNT_SQL,
  CARD_SYNC_STAGE_TABLE_SQL,
  getCardColumns,
  getProviderPriceStates,
  INSERT_NEW_CARDS_SQL,
  metadataSignature,
  parseStoredCard,
  PRICE_ONLY_APPLY_EXPECTATIONS_SQL,
  PRICE_HISTORY_CLEANUP_SQL,
  providerPriceChanged,
  sanitizeIncomingCard,
  SNAPSHOT_APPLY_MISMATCH_COUNT_SQL,
  SYNC_LOCK_TABLE_SQL,
  type CardColumns,
  type JsonObject,
  type ProviderPriceState,
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

const SYNC_NAME = "card-sync";
const LOCK_TTL_SECONDS = 15 * 60;
const WARNING_SAMPLE_LIMIT = 10;
const DEFAULT_SNAPSHOT_TIME_ZONE = "Europe/Oslo";

type StoredCardRow = {
  [key: string]: unknown;
  id: unknown;
  image_large: unknown;
  image_small: unknown;
  name: unknown;
  number: unknown;
  raw_json: unknown;
  set_id: unknown;
  set_name: unknown;
};

type IdRow = {
  [key: string]: unknown;
  id: unknown;
};

type CountRow = {
  [key: string]: unknown;
  count: unknown;
};

type PriceApplyExpectationRow = {
  [key: string]: unknown;
  cardmarket_count: unknown;
  tcgplayer_count: unknown;
};

type WarningBucket = {
  count: number;
  message: string;
  samples: string[];
};

class SyncWarnings {
  readonly buckets = new Map<string, WarningBucket>();

  add(code: string, message: string, sample?: string, amount = 1): void {
    const bucket = this.buckets.get(code) ?? {
      count: 0,
      message,
      samples: [],
    };
    bucket.count += amount;
    if (sample && bucket.samples.length < WARNING_SAMPLE_LIMIT) {
      bucket.samples.push(sample);
    }
    this.buckets.set(code, bucket);
  }

  list(): SyncWarning[] {
    return [...this.buckets.entries()].map(
      ([code, { count, message, samples }]) => ({
        code,
        count,
        message,
        samples,
      }),
    );
  }
}

export type CardSyncSummary = {
  applied: boolean;
  cardmarketPriceChanges: number;
  cleanupDeleted: number;
  dryRun: boolean;
  expectedApiCards: number;
  fetchedCards: number;
  finalCards: number;
  initialCards: number;
  insertedCards: number;
  metadataUpdates: number;
  missingExistingCards: number;
  pagesStaged: number;
  priceOnlyCardUpdates: number;
  snapshotDate: string;
  snapshotsPresent: number;
  stagedCards: number;
  staleStageRowsRemoved: number;
  tcgplayerPriceChanges: number;
  unchangedCards: number;
  warningCount: number;
};

export type CardSyncResult = {
  runId: string;
  status: "clean" | "warnings";
  summary: CardSyncSummary;
  warnings: SyncWarning[];
};

function getSnapshotDate(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const date = `${values.year}-${values.month}-${values.day}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Could not calculate a snapshot date for ${timeZone}`);
  }
  return date;
}

function databaseText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function storedColumns(row: StoredCardRow): CardColumns {
  return {
    imageLarge: databaseText(row.image_large),
    imageSmall: databaseText(row.image_small),
    name: String(row.name),
    number: databaseText(row.number),
    setId: databaseText(row.set_id),
    setName: databaseText(row.set_name),
  };
}

function columnsDiffer(left: CardColumns, right: CardColumns): boolean {
  return (
    left.imageLarge !== right.imageLarge ||
    left.imageSmall !== right.imageSmall ||
    left.name !== right.name ||
    left.number !== right.number ||
    left.setId !== right.setId ||
    left.setName !== right.setName
  );
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
    [JSON.stringify(cardIds)],
  );
  return new Map(rows.map((row) => [String(row.id), row]));
}

function addProviderWarnings(
  cardId: string,
  providerName: "tcgplayer" | "cardmarket",
  incoming: ProviderPriceState,
  existing: ProviderPriceState | null,
  warnings: SyncWarnings,
): void {
  if (!incoming.prices) {
    warnings.add(
      `${providerName}_missing_prices`,
      `${providerName} had no usable prices; the current card price was preserved when available and missing history values use SQL NULL`,
      cardId,
    );
  }
  if (incoming.pricesProvided && !incoming.prices) {
    warnings.add(
      `${providerName}_unusable_prices`,
      `${providerName} returned a prices object without a positive finite price`,
      cardId,
    );
  }
  if (!incoming.prices && existing?.prices) {
    warnings.add(
      `${providerName}_price_regression`,
      `${providerName} prices disappeared upstream while a usable current price exists`,
      cardId,
    );
  }
  if (incoming.prices && !incoming.updatedAt) {
    warnings.add(
      `${providerName}_missing_updated_at`,
      `${providerName} returned usable prices without an updatedAt value`,
      cardId,
    );
  }
}

async function ensureOperationalTables(): Promise<void> {
  await dbBatch(
    [
      SYNC_LOCK_TABLE_SQL,
      SYNC_RUN_TABLE_SQL,
      SYNC_RUN_STARTED_INDEX_SQL,
      CARD_SYNC_STAGE_TABLE_SQL,
    ],
    "write",
  );
}

async function startAudit(
  runId: string,
  snapshotDate: string,
): Promise<void> {
  await dbExecute(
    `
      INSERT INTO sync_runs
        (id, sync_name, status, snapshot_date)
      VALUES (?, ?, 'running', ?)
    `,
    [runId, SYNC_NAME, snapshotDate],
  );
}

async function markAbandonedAudits(runId: string): Promise<number> {
  const result = await dbRun(
    `
      UPDATE sync_runs
      SET
        status = 'failed',
        finished_at = CURRENT_TIMESTAMP,
        error_message = 'Previous process ended without finalizing its audit'
      WHERE status = 'running' AND id <> ?
    `,
    [runId],
  );
  return result.changes;
}

async function finishAudit(
  runId: string,
  status: SyncRunStatus,
  summary: CardSyncSummary,
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
      summary.stagedCards,
      summary.pagesStaged,
      summary.snapshotsPresent,
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

async function acquireLock(token: string): Promise<boolean> {
  const statement = buildAcquireSyncLock(
    SYNC_NAME,
    token,
    LOCK_TTL_SECONDS,
  );
  const result = await dbExecute(statement.sql, statement.args);
  return result.rows.some((row) => String(row.token) === token);
}

async function renewLock(token: string): Promise<void> {
  const statement = buildRenewSyncLock(
    SYNC_NAME,
    token,
    LOCK_TTL_SECONDS,
  );
  const result = await dbRun(statement.sql, statement.args);
  if (result.changes !== 1) {
    throw new Error("The card sync lock was lost");
  }
}

async function releaseLock(token: string): Promise<void> {
  const statement = buildReleaseSyncLock(SYNC_NAME, token);
  const result = await dbRun(statement.sql, statement.args);
  if (result.changes !== 1) {
    throw new Error("The card sync lock could not be released");
  }
}

async function getCount(
  sql: string,
  args: Array<string | number | null> = [],
): Promise<number> {
  const row = await dbGet<CountRow>(sql, args);
  if (!row) throw new Error("Database count query returned no row");
  return strictDatabaseCount(row.count, "Database count query");
}

function rowsAffected(
  result: { rowsAffected: number | bigint } | undefined,
): number {
  if (!result) {
    throw new Error("Database batch omitted a statement result");
  }
  return strictDatabaseCount(result.rowsAffected, "Database rowsAffected");
}

function strictDatabaseCount(value: unknown, context: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${context} returned an invalid count`);
  }
  return count;
}

async function inspectStoredDataIntegrity(
  snapshotDate: string,
  warnings: SyncWarnings,
): Promise<void> {
  const invalidCardJson = await getCount(`
    SELECT COUNT(*) AS count
    FROM cards
    WHERE json_valid(raw_json) = 0
  `);
  if (invalidCardJson > 0) {
    throw new Error(
      `Stored-data integrity check found ${invalidCardJson} cards with invalid raw_json`,
    );
  }

  const invalidCardIdentities = await getCount(`
    SELECT COUNT(*) AS count
    FROM cards
    WHERE
      json_type(raw_json) <> 'object'
      OR json_type(raw_json, '$.id') <> 'text'
      OR json_extract(raw_json, '$.id') <> id
  `);
  if (invalidCardIdentities > 0) {
    throw new Error(
      `Stored-data integrity check found ${invalidCardIdentities} cards whose raw_json identity does not match the SQL row`,
    );
  }

  const invalidSnapshotJson = await getCount(`
    SELECT COUNT(*) AS count
    FROM price_snapshots
    WHERE
      (tcgplayer_prices IS NOT NULL AND json_valid(tcgplayer_prices) = 0)
      OR
      (cardmarket_prices IS NOT NULL AND json_valid(cardmarket_prices) = 0)
  `);
  if (invalidSnapshotJson > 0) {
    throw new Error(
      `Stored-data integrity check found ${invalidSnapshotJson} price snapshots with invalid JSON`,
    );
  }

  const invalidSnapshotDates = await getCount(`
    SELECT COUNT(*) AS count
    FROM price_snapshots
    WHERE
      recorded_at NOT GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      OR date(recorded_at) IS NULL
      OR date(recorded_at) <> recorded_at
  `);
  if (invalidSnapshotDates > 0) {
    throw new Error(
      `Stored-data integrity check found ${invalidSnapshotDates} price snapshots with invalid dates`,
    );
  }

  const orphanSnapshots = await getCount(`
    SELECT COUNT(*) AS count
    FROM price_snapshots AS snapshots
    LEFT JOIN cards ON cards.id = snapshots.card_id
    WHERE cards.id IS NULL
  `);
  if (orphanSnapshots > 0) {
    warnings.add(
      "orphan_price_snapshots",
      "Price-history rows exist for card IDs that are not currently in cards",
      undefined,
      orphanSnapshots,
    );
  }

  const futureSnapshots = await getCount(
    `
      SELECT COUNT(*) AS count
      FROM price_snapshots
      WHERE recorded_at > ?
    `,
    [snapshotDate],
  );
  if (futureSnapshots > 0) {
    warnings.add(
      "future_price_snapshots",
      "Price-history rows exist after the current configured snapshot date",
      undefined,
      futureSnapshots,
    );
  }
}

async function applyStagedCatalog(
  runId: string,
  summary: CardSyncSummary,
): Promise<void> {
  const expected = await dbGet<PriceApplyExpectationRow>(
    PRICE_ONLY_APPLY_EXPECTATIONS_SQL,
    [runId],
  );
  if (!expected) {
    throw new Error("Could not calculate expected price-update counts");
  }
  const expectedTcgplayerUpdates = strictDatabaseCount(
    expected.tcgplayer_count,
    "Expected TCGplayer update count",
  );
  const expectedCardmarketUpdates = strictDatabaseCount(
    expected.cardmarket_count,
    "Expected Cardmarket update count",
  );

  const results = await dbBatch(
    [
      { sql: APPLY_METADATA_UPDATES_SQL, args: [runId] },
      { sql: APPLY_TCGPLAYER_PRICE_UPDATES_SQL, args: [runId] },
      { sql: APPLY_CARDMARKET_PRICE_UPDATES_SQL, args: [runId] },
      { sql: INSERT_NEW_CARDS_SQL, args: [runId] },
      {
        sql: APPLY_DAILY_SNAPSHOTS_SQL,
        args: [summary.snapshotDate, runId],
      },
      {
        sql: PRICE_HISTORY_CLEANUP_SQL,
        args: [summary.snapshotDate],
      },
    ],
    "write",
  );

  summary.cleanupDeleted = rowsAffected(results[5]);
  summary.applied = true;

  if (rowsAffected(results[0]) !== summary.metadataUpdates) {
    throw new Error(
      `Metadata apply count mismatch: expected ${summary.metadataUpdates}, changed ${rowsAffected(results[0])}`,
    );
  }
  if (rowsAffected(results[1]) !== expectedTcgplayerUpdates) {
    throw new Error(
      `TCGplayer apply count mismatch: expected ${expectedTcgplayerUpdates}, changed ${rowsAffected(results[1])}`,
    );
  }
  if (rowsAffected(results[2]) !== expectedCardmarketUpdates) {
    throw new Error(
      `Cardmarket apply count mismatch: expected ${expectedCardmarketUpdates}, changed ${rowsAffected(results[2])}`,
    );
  }
  if (rowsAffected(results[3]) !== summary.insertedCards) {
    throw new Error(
      `New-card apply count mismatch: expected ${summary.insertedCards}, inserted ${rowsAffected(results[3])}`,
    );
  }
}

async function assertAppliedCatalogIntegrity(
  runId: string,
  snapshotDate: string,
): Promise<void> {
  const invalidLiveCardJson = await getCount(`
    SELECT COUNT(*) AS count
    FROM cards
    WHERE json_valid(raw_json) = 0
  `);
  if (invalidLiveCardJson > 0) {
    throw new Error(
      `Post-apply verification found ${invalidLiveCardJson} cards with invalid raw_json`,
    );
  }

  const cardMismatches = await getCount(
    CARD_APPLY_MISMATCH_COUNT_SQL,
    [runId],
  );
  if (cardMismatches > 0) {
    throw new Error(
      `Post-apply card verification found ${cardMismatches} rows that do not match staged data`,
    );
  }

  const snapshotMismatches = await getCount(
    SNAPSHOT_APPLY_MISMATCH_COUNT_SQL,
    [snapshotDate, runId],
  );
  if (snapshotMismatches > 0) {
    throw new Error(
      `Post-apply snapshot verification found ${snapshotMismatches} rows that do not match staged prices`,
    );
  }
}

async function stageCompleteCatalog(
  runId: string,
  token: string,
  summary: CardSyncSummary,
  warnings: SyncWarnings,
): Promise<Set<string>> {
  const seenCardIds = new Set<string>();
  let expectedCards: number | null = null;
  let page = 1;

  while (true) {
    await renewLock(token);
    console.log(`Fetching card catalog page ${page}`);
    const response = await getCardsPage(page);
    expectedCards = validateStrictApiPage(
      response,
      page,
      expectedCards,
    );
    summary.expectedApiCards = expectedCards;

    if (response.retryCount > 0) {
      warnings.add(
        "api_retries",
        "API requests required retries before succeeding",
        `page ${page}`,
        response.retryCount,
      );
    }

    await renewLock(token);
    const cards = response.data.map(sanitizeIncomingCard);
    for (const card of cards) {
      if (seenCardIds.has(card.id)) {
        throw new Error(`Card API returned duplicate card ID ${card.id}`);
      }
      seenCardIds.add(card.id);
    }

    const storedCards = await loadStoredCards(
      cards.map((card) => card.id),
    );
    const statements: SqlStatement[] = [];
    const pageStats = {
      cardmarketPriceChanges: 0,
      insertedCards: 0,
      metadataUpdates: 0,
      priceOnlyCardUpdates: 0,
      tcgplayerPriceChanges: 0,
      unchangedCards: 0,
    };

    for (const incomingCard of cards) {
      const stored = storedCards.get(incomingCard.id);
      const existingCard = stored
        ? parseStoredCard(stored.raw_json, incomingCard.id)
        : undefined;
      const incomingStates = getProviderPriceStates(
        incomingCard as JsonObject,
      );
      const existingStates = existingCard
        ? getProviderPriceStates(existingCard)
        : null;

      addProviderWarnings(
        incomingCard.id,
        "tcgplayer",
        incomingStates.tcgplayer,
        existingStates?.tcgplayer ?? null,
        warnings,
      );
      addProviderWarnings(
        incomingCard.id,
        "cardmarket",
        incomingStates.cardmarket,
        existingStates?.cardmarket ?? null,
        warnings,
      );

      const safeFullCard = buildSafeFullCard(
        incomingCard,
        existingCard,
      );
      let metadataChanged = false;
      let tcgplayerChanged = false;
      let cardmarketChanged = false;

      if (!stored || !existingCard) {
        pageStats.insertedCards += 1;
        if (summary.initialCards > 0) {
          warnings.add(
            "new_cards_detected",
            "Cards not present in the existing database were returned upstream and will be inserted",
            incomingCard.id,
          );
        }
      } else {
        if (!existingStates) {
          throw new Error(
            `Existing price state was not loaded for ${incomingCard.id}`,
          );
        }
        metadataChanged =
          metadataSignature(existingCard) !==
            metadataSignature(incomingCard as JsonObject) ||
          columnsDiffer(
            storedColumns(stored),
            getCardColumns(incomingCard as JsonObject),
          );
        tcgplayerChanged = providerPriceChanged(
          incomingStates.tcgplayer,
          existingStates.tcgplayer,
        );
        cardmarketChanged = providerPriceChanged(
          incomingStates.cardmarket,
          existingStates.cardmarket,
        );

        if (metadataChanged) {
          pageStats.metadataUpdates += 1;
          warnings.add(
            "metadata_changes_detected",
            "Existing cards had upstream metadata changes; the complete upstream card will be stored while Grok remains protected",
            incomingCard.id,
          );
        }
        if (tcgplayerChanged) {
          pageStats.tcgplayerPriceChanges += 1;
        }
        if (cardmarketChanged) {
          pageStats.cardmarketPriceChanges += 1;
        }
        if (
          !metadataChanged &&
          (tcgplayerChanged || cardmarketChanged)
        ) {
          pageStats.priceOnlyCardUpdates += 1;
        }
        if (
          !metadataChanged &&
          !tcgplayerChanged &&
          !cardmarketChanged
        ) {
          pageStats.unchangedCards += 1;
        }
      }

      statements.push(
        buildStageCardStatement(
          runId,
          safeFullCard,
          incomingStates,
          {
            cardmarketChanged,
            isNew: !stored,
            metadataChanged,
            tcgplayerChanged,
          },
        ),
      );
    }

    await dbBatch(statements, "write");
    summary.cardmarketPriceChanges +=
      pageStats.cardmarketPriceChanges;
    summary.insertedCards += pageStats.insertedCards;
    summary.metadataUpdates += pageStats.metadataUpdates;
    summary.priceOnlyCardUpdates += pageStats.priceOnlyCardUpdates;
    summary.tcgplayerPriceChanges +=
      pageStats.tcgplayerPriceChanges;
    summary.unchangedCards += pageStats.unchangedCards;
    summary.fetchedCards += cards.length;
    summary.stagedCards += statements.length;
    summary.pagesStaged += 1;
    await renewLock(token);

    if (summary.fetchedCards >= expectedCards) break;
    page += 1;
    await waitBetweenRequests();
  }

  validateCatalogCompletion({
    expectedCards,
    fetchedCards: summary.fetchedCards,
    pagesStaged: summary.pagesStaged,
    pageSize: PAGE_SIZE,
    uniqueCards: seenCardIds.size,
  });
  return seenCardIds;
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

export async function runCardSync(
  dryRun = false,
): Promise<CardSyncResult> {
  assertExplicitDatabaseTarget();
  await ensureOperationalTables();
  await assertDatabaseSchemaCompatible();

  const timeZone =
    process.env.PRICE_SNAPSHOT_TIME_ZONE?.trim() ||
    DEFAULT_SNAPSHOT_TIME_ZONE;
  const summary: CardSyncSummary = {
    applied: false,
    cardmarketPriceChanges: 0,
    cleanupDeleted: 0,
    dryRun,
    expectedApiCards: 0,
    fetchedCards: 0,
    finalCards: 0,
    initialCards: 0,
    insertedCards: 0,
    metadataUpdates: 0,
    missingExistingCards: 0,
    pagesStaged: 0,
    priceOnlyCardUpdates: 0,
    snapshotDate: getSnapshotDate(timeZone),
    snapshotsPresent: 0,
    stagedCards: 0,
    staleStageRowsRemoved: 0,
    tcgplayerPriceChanges: 0,
    unchangedCards: 0,
    warningCount: 0,
  };
  const runId = randomUUID();
  const token = randomUUID();
  const warnings = new SyncWarnings();
  await startAudit(runId, summary.snapshotDate);

  let acquired = false;
  let syncError: unknown;

  try {
    acquired = await acquireLock(token);
    if (!acquired) {
      throw new Error(
        "Another card sync is already running; no live changes were made",
      );
    }
    const abandonedAudits = await markAbandonedAudits(runId);
    if (abandonedAudits > 0) {
      warnings.add(
        "abandoned_sync_runs",
        "Previous sync runs ended without finalizing their audit",
        undefined,
        abandonedAudits,
      );
    }

    const staleRows = await dbRun(
      "DELETE FROM card_sync_stage WHERE run_id <> ?",
      [runId],
    );
    summary.staleStageRowsRemoved = staleRows.changes;
    if (staleRows.changes > 0) {
      warnings.add(
        "stale_staging_recovered",
        "Staging rows from an interrupted prior sync were removed",
        undefined,
        staleRows.changes,
      );
    }

    const initialRows = await dbAll<IdRow>("SELECT id FROM cards");
    const initialCardIds = new Set(
      initialRows.map((row) => String(row.id)),
    );
    summary.initialCards = initialCardIds.size;
    await inspectStoredDataIntegrity(summary.snapshotDate, warnings);

    const seenCardIds = await stageCompleteCatalog(
      runId,
      token,
      summary,
      warnings,
    );
    const missingExistingIds = [...initialCardIds].filter(
      (cardId) => !seenCardIds.has(cardId),
    );
    summary.missingExistingCards = missingExistingIds.length;
    for (const cardId of missingExistingIds) {
      warnings.add(
        "missing_existing_cards",
        "Existing cards were not returned upstream and were left unchanged",
        cardId,
      );
    }

    if (!dryRun) {
      await renewLock(token);
      await applyStagedCatalog(runId, summary);
      await renewLock(token);

      summary.finalCards = await getCount(
        "SELECT COUNT(*) AS count FROM cards",
      );
      const expectedFinalCards =
        summary.initialCards + summary.insertedCards;
      if (summary.finalCards !== expectedFinalCards) {
        throw new Error(
          `Final card count mismatch: expected ${expectedFinalCards}, found ${summary.finalCards}`,
        );
      }

      summary.snapshotsPresent = await getCount(
        `
          SELECT COUNT(*) AS count
          FROM price_snapshots AS snapshots
          INNER JOIN card_sync_stage AS stage
            ON stage.card_id = snapshots.card_id
          WHERE
            stage.run_id = ?
            AND snapshots.recorded_at = ?
        `,
        [runId, summary.snapshotDate],
      );
      if (summary.snapshotsPresent !== summary.stagedCards) {
        throw new Error(
          `Daily snapshot verification failed: expected ${summary.stagedCards}, found ${summary.snapshotsPresent}`,
        );
      }
      await assertAppliedCatalogIntegrity(
        runId,
        summary.snapshotDate,
      );
    } else {
      summary.finalCards = summary.initialCards;
    }

    try {
      await dbRun("DELETE FROM card_sync_stage WHERE run_id = ?", [runId]);
    } catch (error) {
      warnings.add(
        "stage_cleanup_failed",
        `Staging cleanup failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  } catch (error) {
    syncError = error;
  }

  if (acquired) {
    try {
      await releaseLock(token);
    } catch (releaseError) {
      if (syncError) {
        logError("Card sync also failed to release its lock", releaseError);
      } else {
        syncError = releaseError;
      }
    }
  }

  const warningList = warnings.list();
  summary.warningCount = warningList.reduce(
    (total, warning) => total + warning.count,
    0,
  );
  logWarnings(warningList);

  if (syncError) {
    const failureStatus: SyncRunStatus = summary.applied
      ? "failed_after_apply"
      : "failed";
    try {
      await finishAudit(
        runId,
        failureStatus,
        summary,
        warningList,
        syncError,
      );
    } catch (auditError) {
      logError("Failed to record the card sync failure audit", auditError);
    }
    throw syncError;
  }

  const status: CardSyncResult["status"] =
    warningList.length > 0 ? "warnings" : "clean";
  await finishAudit(runId, status, summary, warningList);
  const result: CardSyncResult = {
    runId,
    status,
    summary,
    warnings: warningList,
  };
  console.log(
    `Card sync finished with status ${status}`,
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
  const dryRun = process.argv.includes("--dry-run");
  void runCardSync(dryRun)
    .then((result) => {
      process.exitCode = exitCodeForSyncStatus(result.status);
    })
    .catch((error: unknown) => {
      logError("Card sync failed", error);
      process.exitCode = 1;
    });
}
