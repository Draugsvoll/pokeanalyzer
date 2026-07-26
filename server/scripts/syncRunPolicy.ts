import type { PokemonTcgApiPage } from "../services/pokemonTcgApi.js";

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
  | "partial_failure";

export type SyncWarning = {
  code: string;
  count: number;
  message: string;
  samples: string[];
};

export type CatalogCompletion = {
  expectedCards: number;
  fetchedCards: number;
  pagesCommitted: number;
  pageSize: number;
  uniqueCards: number;
};

export function validateStrictApiPage(
  page: PokemonTcgApiPage,
  requestedPage: number,
  expectedTotalCards: number | null,
): number {
  if (page.totalCount <= 0) {
    throw new Error("Card API reported an empty catalog");
  }
  if (
    expectedTotalCards !== null &&
    page.totalCount !== expectedTotalCards
  ) {
    throw new Error(
      `Card API totalCount changed during the run (${expectedTotalCards} to ${page.totalCount})`,
    );
  }

  const offset = (requestedPage - 1) * page.pageSize;
  const expectedPageCount = Math.min(
    page.pageSize,
    Math.max(0, page.totalCount - offset),
  );
  if (page.count !== expectedPageCount) {
    throw new Error(
      `Card API page ${requestedPage} was incomplete: expected ${expectedPageCount}, received ${page.count}`,
    );
  }

  return page.totalCount;
}

export function validateCatalogCompletion({
  expectedCards,
  fetchedCards,
  pagesCommitted,
  pageSize,
  uniqueCards,
}: CatalogCompletion): void {
  const expectedPages = Math.ceil(expectedCards / pageSize);
  if (
    fetchedCards !== expectedCards ||
    uniqueCards !== expectedCards ||
    pagesCommitted !== expectedPages
  ) {
    throw new Error(
      "Catalog completeness validation failed: " +
        JSON.stringify({
          expectedCards,
          expectedPages,
          fetchedCards,
          pagesCommitted,
          uniqueCards,
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
