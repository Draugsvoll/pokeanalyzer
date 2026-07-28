import { dbAll } from "./db.js";
import {
  DAILY_SNAPSHOT_UNIQUE_KEY_SQL,
  findMissingColumns,
} from "./schemaValidationPolicy.js";

type TableInfoRow = {
  [key: string]: unknown;
  name: unknown;
};

type UniqueIndexColumnRow = {
  [key: string]: unknown;
  column_name: unknown;
  index_name: unknown;
};

const REQUIRED_COLUMNS = {
  cards: [
    "id",
    "number",
    "name",
    "set_id",
    "set_name",
    "image_small",
    "image_large",
    "raw_json",
    "updated_at",
  ],
  card_sync_stage: [
    "run_id",
    "card_id",
    "is_new",
    "metadata_changed",
    "tcgplayer_changed",
    "cardmarket_changed",
    "number",
    "name",
    "set_id",
    "set_name",
    "image_small",
    "image_large",
    "raw_json",
    "tcgplayer_prices",
    "cardmarket_prices",
    "tcgplayer_updated_at",
    "cardmarket_updated_at",
  ],
  price_snapshots: [
    "id",
    "card_id",
    "recorded_at",
    "tcgplayer_prices",
    "cardmarket_prices",
    "tcgplayer_updated_at",
    "cardmarket_updated_at",
  ],
  sync_locks: ["name", "token", "acquired_at", "expires_at"],
  sync_runs: [
    "id",
    "sync_name",
    "status",
    "started_at",
    "finished_at",
    "snapshot_date",
    "initial_cards",
    "expected_api_cards",
    "fetched_cards",
    "unique_cards",
    "pages_committed",
    "snapshots_written",
    "warning_count",
    "warnings_json",
    "summary_json",
    "error_message",
  ],
} as const;

async function assertRequiredColumns(): Promise<void> {
  const failures: string[] = [];

  for (const [tableName, requiredColumns] of Object.entries(
    REQUIRED_COLUMNS,
  )) {
    const rows = await dbAll<TableInfoRow>(
      `PRAGMA table_info("${tableName}")`,
    );
    if (rows.length === 0) {
      failures.push(`${tableName}: table is missing`);
      continue;
    }

    const missing = findMissingColumns(
      rows.map((row) => String(row.name)),
      requiredColumns,
    );
    if (missing.length > 0) {
      failures.push(`${tableName}: missing ${missing.join(", ")}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Database schema is incompatible: ${failures.join("; ")}. Run npm run db:init to create missing tables. If the check still fails, migrate the reported existing table before syncing.`,
    );
  }
}

async function assertDailySnapshotUniqueKey(): Promise<void> {
  const rows = await dbAll<UniqueIndexColumnRow>(
    DAILY_SNAPSHOT_UNIQUE_KEY_SQL,
  );

  const columnsByIndex = new Map<string, string[]>();
  for (const row of rows) {
    const indexName = String(row.index_name);
    const columns = columnsByIndex.get(indexName) ?? [];
    columns.push(String(row.column_name));
    columnsByIndex.set(indexName, columns);
  }

  const hasRequiredKey = [...columnsByIndex.values()].some(
    (columns) =>
      columns.length === 2 &&
      columns[0] === "card_id" &&
      columns[1] === "recorded_at",
  );
  if (!hasRequiredKey) {
    throw new Error(
      "Database schema is incompatible: price_snapshots must have UNIQUE(card_id, recorded_at). Migrate that table before syncing.",
    );
  }
}

/**
 * Read-only verification of everything the strict card sync relies on.
 * It must pass before API fetching, staging, or live card changes begin.
 */
export async function assertDatabaseSchemaCompatible(): Promise<void> {
  await assertRequiredColumns();
  await assertDailySnapshotUniqueKey();
}
