import path from "node:path";
import { createClient } from "@libsql/client";

// This database is deliberately separate from the existing card catalogue.
export const pkmnPricesDb = createClient({
  url:
    process.env.PKMNPRICES_DATABASE_URL ||
    `file:${path.resolve("server/db/pkmnprices.sqlite")}`,
  authToken: process.env.PKMNPRICES_DATABASE_AUTH_TOKEN || undefined,
});

export const pkmnPricesReady = pkmnPricesDb
  .execute(
    `
    CREATE TABLE IF NOT EXISTS pkmn_cards (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      number TEXT,
      set_name TEXT,
      rarity TEXT,
      image_url TEXT,
      raw_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
  )
  .then(() =>
    pkmnPricesDb.execute(
      "CREATE INDEX IF NOT EXISTS idx_pkmn_cards_fetched_at ON pkmn_cards(fetched_at, id)",
    ),
  )
  .then(() =>
    pkmnPricesDb.execute(`
      CREATE TABLE IF NOT EXISTS pkmn_import_progress (
        name TEXT PRIMARY KEY,
        next_page INTEGER NOT NULL
      )
    `),
  );
