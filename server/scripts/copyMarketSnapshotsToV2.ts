import "dotenv/config";
import { createClient } from "@libsql/client";
import {
  assertExplicitPokeTraceDatabaseTarget,
  migratePokeTraceDatabase,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { withPokeTraceJobLock } from "./pokeTraceJobLock.js";
import { copyMarketSnapshots } from "./copyMarketSnapshotsJob.js";

assertExplicitPokeTraceDatabaseTarget();
const sourceUrl = process.env.POKETRACE_DATABASE_URL?.trim();
const targetUrl = process.env.POKETRACE_DATABASE_URL_V2?.trim();
if (!sourceUrl || !targetUrl || sourceUrl === targetUrl) {
  throw new Error("Snapshot copy requires distinct v1 and v2 database URLs");
}
const source = createClient({
  url: sourceUrl,
  authToken: process.env.POKETRACE_DATABASE_AUTH_TOKEN,
});

try {
  await migratePokeTraceDatabase();
  const acquired = await withPokeTraceJobLock(async (assertHeld) => {
    await copyMarketSnapshots(source, pokeTraceDb, assertHeld);
  });
  if (!acquired) throw new Error("The v2 maintenance lock is already held");
} finally {
  source.close();
  pokeTraceDb.close();
}
