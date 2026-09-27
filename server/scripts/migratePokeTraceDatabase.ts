import {
  assertExplicitPokeTraceDatabaseTarget,
  migratePokeTraceDatabase,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { logError } from "../security/logging.js";

async function runPokeTraceMigrations() {
  assertExplicitPokeTraceDatabaseTarget();
  await migratePokeTraceDatabase();
  console.log("PokeTrace database migrations completed successfully.");
}

try {
  await runPokeTraceMigrations();
} catch (error) {
  logError("PokeTrace database migration failed", error);
  process.exitCode = 1;
} finally {
  pokeTraceDb.close();
}
