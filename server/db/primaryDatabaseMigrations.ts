import { createHash } from "node:crypto";
import fs from "node:fs";

export type PrimaryDatabaseMigration = {
  checksum: string;
  name: string;
  sql: string;
  version: number;
};

function loadMigration(fileName: string) {
  const sql = fs.readFileSync(
    new URL(`./migrations/primary/${fileName}`, import.meta.url),
    "utf8",
  );
  return {
    checksum: createHash("sha256").update(sql).digest("hex"),
    sql,
  };
}

const initialSchema = loadMigration("001_initial_schema.sql");
const removeLegacyNewsFeed = loadMigration("002_remove_legacy_news_feed.sql");
const addMarketSummaryFeed = loadMigration("003_add_market_summary_feed.sql");
const separateMarketSummary = loadMigration("004_separate_market_summary.sql");

/**
 * Applied migrations are immutable. Add the next numbered migration instead
 * of editing an existing entry or its SQL file.
 */
export const PRIMARY_DATABASE_MIGRATIONS = [
  {
    checksum: initialSchema.checksum,
    name: "initial_schema",
    sql: initialSchema.sql,
    version: 1,
  },
  {
    checksum: removeLegacyNewsFeed.checksum,
    name: "remove_legacy_news_feed",
    sql: removeLegacyNewsFeed.sql,
    version: 2,
  },
  {
    checksum: addMarketSummaryFeed.checksum,
    name: "add_market_summary_feed",
    sql: addMarketSummaryFeed.sql,
    version: 3,
  },
  {
    checksum: separateMarketSummary.checksum,
    name: "separate_market_summary",
    sql: separateMarketSummary.sql,
    version: 4,
  },
] as const satisfies readonly PrimaryDatabaseMigration[];
