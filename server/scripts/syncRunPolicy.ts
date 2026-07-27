type ApiPageMetadata = {
  [key: string]: unknown;
  count: number;
  page: number;
  pageSize: number;
  totalCount: number;
};

export const SYNC_RUN_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sync_runs (
    id TEXT PRIMARY KEY,
    sync_name TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    snapshot_date TEXT,
    initial_cards INTEGER,
    expected_api_cards INTEGER,
    fetched_cards INTEGER NOT NULL DEFAULT 0,
    unique_cards INTEGER NOT NULL DEFAULT 0,
    pages_committed INTEGER NOT NULL DEFAULT 0,
    snapshots_written INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    summary_json TEXT,
    error_message TEXT
  )
`;

export const SYNC_RUN_STARTED_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at
  ON sync_runs(started_at DESC)
`;

export type SyncRunStatus =
  | "running"
  | "clean"
  | "warnings"
  | "failed"
  | "failed_after_apply";

export type SyncWarning = {
  code: string;
  count: number;
  message: string;
  samples: string[];
};

export type SetCatalogCompletion = {
  completedSets: number;
  expectedCards: number;
  expectedCardPages: number;
  expectedSets: number;
  fetchedCards: number;
  pagesStaged: number;
  uniqueCards: number;
};

export type SetDiscoveryCompletion = {
  expectedSets: number;
  fetchedSets: number;
  pageSize: number;
  pagesFetched: number;
  uniqueSets: number;
};

export function registerUniqueId(
  seenIds: Set<string>,
  id: string,
  scope: string,
): void {
  if (seenIds.has(id)) {
    throw new Error(`${scope} returned duplicate ID ${id}`);
  }
  seenIds.add(id);
}

export function validateCardSetMembership(
  cardId: string,
  cardSetId: string | undefined,
  requestedSetId: string,
): void {
  if (cardSetId !== requestedSetId) {
    throw new Error(
      `Card API set query ${requestedSetId} returned card ${cardId} from set ${String(cardSetId)}`,
    );
  }
}

export function validateStrictApiPage(
  page: ApiPageMetadata,
  requestedPage: number,
  expectedTotalCards: number | null,
  scope = "Card API",
): number {
  if (page.totalCount <= 0) {
    throw new Error(`${scope} reported an empty catalog`);
  }
  if (
    expectedTotalCards !== null &&
    page.totalCount !== expectedTotalCards
  ) {
    throw new Error(
      `${scope} totalCount changed during the run (${expectedTotalCards} to ${page.totalCount})`,
    );
  }

  const offset = (requestedPage - 1) * page.pageSize;
  const expectedPageCount = Math.min(
    page.pageSize,
    Math.max(0, page.totalCount - offset),
  );
  if (page.count !== expectedPageCount) {
    throw new Error(
      `${scope} page ${requestedPage} was incomplete: expected ${expectedPageCount}, received ${page.count}`,
    );
  }

  return page.totalCount;
}

export function validateSetCatalogCompletion({
  completedSets,
  expectedCards,
  expectedCardPages,
  expectedSets,
  fetchedCards,
  pagesStaged,
  uniqueCards,
}: SetCatalogCompletion): void {
  if (
    completedSets !== expectedSets ||
    fetchedCards !== expectedCards ||
    uniqueCards !== expectedCards ||
    pagesStaged !== expectedCardPages
  ) {
    throw new Error(
      "Set catalog completeness validation failed: " +
        JSON.stringify({
          completedSets,
          expectedCards,
          expectedCardPages,
          expectedSets,
          fetchedCards,
          pagesStaged,
          uniqueCards,
        }),
    );
  }
}

export function validateSetDiscoveryCompletion({
  expectedSets,
  fetchedSets,
  pageSize,
  pagesFetched,
  uniqueSets,
}: SetDiscoveryCompletion): void {
  const expectedPages = Math.ceil(expectedSets / pageSize);
  if (
    expectedSets <= 0 ||
    fetchedSets !== expectedSets ||
    uniqueSets !== expectedSets ||
    pagesFetched !== expectedPages
  ) {
    throw new Error(
      "Set discovery completeness validation failed: " +
        JSON.stringify({
          expectedPages,
          expectedSets,
          fetchedSets,
          pagesFetched,
          uniqueSets,
        }),
    );
  }
}

export function exitCodeForSyncStatus(status: SyncRunStatus): 0 | 1 | 2 {
  if (status === "clean") return 0;
  if (status === "warnings") return 2;
  return 1;
}

export function safeSyncErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown synchronization error";
  return message.slice(0, 2_000);
}
