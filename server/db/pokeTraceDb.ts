import "dotenv/config";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { ensureMarketCategoriesStore } from "../services/marketCategories.js";
import { ensurePokeTraceCatalogStore } from "../services/pokeTraceCatalogStore.js";
import { ensurePokeTraceFilterOptionsStore } from "../services/pokeTraceFilterOptionsStore.js";

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

async function hasCardColumn(
  database: PokeTraceMigrationDatabase,
  name: string,
) {
  const columns = await database.execute("PRAGMA table_info(poketrace_cards)");
  return columns.rows.some((column) => column.name === name);
}

async function ensureCardColumn(
  database: PokeTraceMigrationDatabase,
  name: string,
  definition: string,
) {
  if (await hasCardColumn(database, name)) return false;
  try {
    await database.execute(
      `ALTER TABLE poketrace_cards ADD COLUMN ${name} ${definition}`,
    );
    return true;
  } catch (error) {
    // Another deployment or maintenance job can migrate concurrently.
    if (!(await hasCardColumn(database, name))) throw error;
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

  await ensureCardColumn(
    database,
    "saved_responses",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  await ensureCardColumn(database, "price_refreshed_at", "TEXT");
  await ensureCardColumn(database, "price_refresh_retry_at", "TEXT");
  await ensureCardColumn(
    database,
    "price_refresh_failures",
    "INTEGER NOT NULL DEFAULT 0",
  );
  await ensureCardColumn(
    database,
    "tcg_market_comparisons",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  await ensureCardColumn(database, "market_price_history", "TEXT");
  await ensureCardColumn(database, "market_price_history_fetched_at", "TEXT");
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
