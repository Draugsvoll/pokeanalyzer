import "dotenv/config";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { ensureMarketCategoriesStore } from "../services/marketCategories.js";
import { ensurePokeTraceCatalogStore } from "../services/pokeTraceCatalogStore.js";
import { ensurePokeTraceFilterOptionsStore } from "../services/pokeTraceFilterOptionsStore.js";
import { ensurePokeTraceSealedCatalogStore } from "../services/pokeTraceSealedCatalogStore.js";

const localFileUrl = `file:${path.resolve("server/db/poketrace.sqlite")}`;
type PokeTraceMigrationDatabase = Pick<Client, "execute">;

export const pokeTraceDb = createClient({
  url: process.env.POKETRACE_DATABASE_URL || localFileUrl,
  authToken: process.env.POKETRACE_DATABASE_AUTH_TOKEN || undefined,
});

export function assertExplicitPokeTraceDatabaseTarget() {
  if (process.env.POKETRACE_DATABASE_URL?.trim()) return;
  if (process.env.ALLOW_LOCAL_DATABASE?.trim().toLowerCase() === "true") return;
  throw new Error(
    "POKETRACE_DATABASE_URL is missing. Set it for shared persistence, or explicitly set ALLOW_LOCAL_DATABASE=true for local development.",
  );
}

type PokeTraceColumnTable =
  | "poketrace_cards"
  | "poketrace_sealed_import_progress"
  | "poketrace_sealed_products";

async function hasTableColumn(
  database: PokeTraceMigrationDatabase,
  table: PokeTraceColumnTable,
  name: string,
) {
  const columns = await database.execute(`PRAGMA table_info(${table})`);
  return columns.rows.some((column) => column.name === name);
}

async function ensureTableColumn(
  database: PokeTraceMigrationDatabase,
  table: PokeTraceColumnTable,
  name: string,
  definition: string,
) {
  if (await hasTableColumn(database, table, name)) return false;
  try {
    await database.execute(
      `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
    );
    return true;
  } catch (error) {
    // Another deployment or maintenance job can migrate concurrently.
    if (!(await hasTableColumn(database, table, name))) throw error;
    return false;
  }
}

let pokeTraceReadyPromise: Promise<void> | null = null;

export async function migratePokeTraceDatabase(
  database: PokeTraceMigrationDatabase = pokeTraceDb,
) {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      card_number TEXT,
      set_name TEXT,
      rarity TEXT,
      variant TEXT,
      image_url TEXT,
      tcgplayer_id TEXT,
      raw_json TEXT NOT NULL,
      saved_responses TEXT NOT NULL DEFAULT '{}',
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      price_refreshed_at TEXT,
      price_refresh_retry_at TEXT,
      price_refresh_failures INTEGER NOT NULL DEFAULT 0,
      tcg_market_comparisons TEXT NOT NULL DEFAULT '{}',
      market_price_history TEXT,
      market_price_history_fetched_at TEXT
    )
  `);

  await ensureTableColumn(
    database,
    "poketrace_cards",
    "saved_responses",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  await ensureTableColumn(
    database,
    "poketrace_cards",
    "price_refreshed_at",
    "TEXT",
  );
  await ensureTableColumn(
    database,
    "poketrace_cards",
    "price_refresh_retry_at",
    "TEXT",
  );
  await ensureTableColumn(
    database,
    "poketrace_cards",
    "price_refresh_failures",
    "INTEGER NOT NULL DEFAULT 0",
  );
  await ensureTableColumn(
    database,
    "poketrace_cards",
    "tcg_market_comparisons",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  await ensureTableColumn(
    database,
    "poketrace_cards",
    "market_price_history",
    "TEXT",
  );
  await ensureTableColumn(
    database,
    "poketrace_cards",
    "market_price_history_fetched_at",
    "TEXT",
  );
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_cards_fetched_at ON poketrace_cards(fetched_at, id)",
  );
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_cards_identity ON poketrace_cards(name, set_name, card_number)",
  );
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_cards_set_name ON poketrace_cards(set_name COLLATE NOCASE)",
  );
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_cards_price_refresh ON poketrace_cards(price_refresh_retry_at, price_refreshed_at, id)",
  );
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_import_progress (
      name TEXT PRIMARY KEY,
      next_cursor TEXT,
      imported_count INTEGER NOT NULL DEFAULT 0,
      complete INTEGER NOT NULL DEFAULT 0
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_sealed_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      set_name TEXT,
      product_family TEXT NOT NULL,
      variant TEXT,
      image_url TEXT,
      tcgplayer_id TEXT,
      raw_json TEXT NOT NULL CHECK (json_valid(raw_json)),
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_crawl_id TEXT,
      market_price_history TEXT,
      market_price_history_fetched_at TEXT
    )
  `);
  await ensureTableColumn(
    database,
    "poketrace_sealed_products",
    "last_seen_crawl_id",
    "TEXT",
  );
  await ensureTableColumn(
    database,
    "poketrace_sealed_products",
    "market_price_history",
    "TEXT",
  );
  await ensureTableColumn(
    database,
    "poketrace_sealed_products",
    "market_price_history_fetched_at",
    "TEXT",
  );
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_sealed_products_fetched_at ON poketrace_sealed_products(fetched_at, id)",
  );
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_sealed_products_identity ON poketrace_sealed_products(name, set_name, product_family)",
  );
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_sealed_products_set_name ON poketrace_sealed_products(set_name COLLATE NOCASE)",
  );
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_sealed_tcg_market_prices (
      product_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      market_price REAL NOT NULL,
      currency TEXT,
      source_updated_at TEXT,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_id, recorded_at)
    )
  `);
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_sealed_prices_date ON poketrace_sealed_tcg_market_prices(recorded_at, product_id)",
  );
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_sealed_import_progress (
      name TEXT PRIMARY KEY,
      next_cursor TEXT,
      imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
      complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0, 1)),
      finalized INTEGER NOT NULL DEFAULT 0 CHECK (finalized IN (0, 1)),
      crawl_id TEXT
    )
  `);
  await ensureTableColumn(
    database,
    "poketrace_sealed_import_progress",
    "crawl_id",
    "TEXT",
  );
  const finalizedColumnAdded = await ensureTableColumn(
    database,
    "poketrace_sealed_import_progress",
    "finalized",
    "INTEGER NOT NULL DEFAULT 0 CHECK (finalized IN (0, 1))",
  );
  if (finalizedColumnAdded) {
    // Only legacy completed rows without a crawl identity are treated as
    // finalized. Tracked crawls remain pending so interrupted finalization is
    // retried after this migration.
    await database.execute(`
      UPDATE poketrace_sealed_import_progress
      SET finalized = 1
      WHERE complete = 1 AND crawl_id IS NULL
    `);
  }
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_job_locks (
      name TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_tcg_market_prices (
      card_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      market_price REAL NOT NULL,
      currency TEXT,
      source_updated_at TEXT,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (card_id, recorded_at)
    )
  `);
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_tcg_market_prices_date ON poketrace_tcg_market_prices(recorded_at, card_id)",
  );
  await database.execute(`
    CREATE TABLE IF NOT EXISTS poketrace_market_snapshots (
      card_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      currency TEXT,
      tcg TEXT CHECK (tcg IS NULL OR json_valid(tcg)),
      ebay TEXT CHECK (ebay IS NULL OR json_valid(ebay)),
      source_updated_at TEXT,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (card_id, recorded_at)
    )
  `);
  await database.execute(
    "CREATE INDEX IF NOT EXISTS idx_poketrace_market_snapshots_date ON poketrace_market_snapshots(recorded_at, card_id)",
  );
  await ensureMarketCategoriesStore(database);
  await ensurePokeTraceCatalogStore(database);
  await ensurePokeTraceSealedCatalogStore(database);
  await ensurePokeTraceFilterOptionsStore(database);
}

const deploymentReady = Promise.resolve();

export function shouldRunRuntimePokeTraceMigrations(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return (
    environment.NODE_ENV !== "production" && !environment.RAILWAY_ENVIRONMENT_ID
  );
}

export function ensurePokeTraceReady() {
  // Local development and tests retain self-initialization. Production schema
  // changes are applied once by the deployment migration job.
  if (!shouldRunRuntimePokeTraceMigrations()) return deploymentReady;
  pokeTraceReadyPromise ??= migratePokeTraceDatabase();
  return pokeTraceReadyPromise;
}
