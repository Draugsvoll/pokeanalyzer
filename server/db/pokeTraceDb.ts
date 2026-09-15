import path from "node:path";
import { createClient } from "@libsql/client";

// Keep this trial separate from the existing catalogue and PkmnPrices trial.
export const pokeTraceDb = createClient({
  url:
    process.env.POKETRACE_DATABASE_URL ||
    `file:${path.resolve("server/db/poketrace.sqlite")}`,
  authToken: process.env.POKETRACE_DATABASE_AUTH_TOKEN || undefined,
});

export const pokeTraceReady = pokeTraceDb
  .execute(
    `
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
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  )
  .then(() =>
    pokeTraceDb.execute(
      "CREATE INDEX IF NOT EXISTS idx_poketrace_cards_fetched_at ON poketrace_cards(fetched_at, id)",
    ),
  )
  .then(() =>
    pokeTraceDb.execute(`
      CREATE TABLE IF NOT EXISTS poketrace_import_progress (
        name TEXT PRIMARY KEY,
        next_cursor TEXT,
        imported_count INTEGER NOT NULL DEFAULT 0,
        complete INTEGER NOT NULL DEFAULT 0
      )
    `),
  )
  .then(() =>
    pokeTraceDb.execute(`
      CREATE TABLE IF NOT EXISTS poketrace_job_locks (
        name TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `),
  );
