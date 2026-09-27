import { closeDatabase, assertExplicitDatabaseTarget } from "../db/db.js";
import { migratePrimaryDatabase } from "../db/migratePrimaryDatabase.js";
import {
  assertExplicitPokeTraceDatabaseTarget,
  migratePokeTraceDatabase,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { logError } from "../security/logging.js";

async function migrateDatabases() {
  assertExplicitDatabaseTarget();
  assertExplicitPokeTraceDatabaseTarget();

  await migratePrimaryDatabase();
  await migratePokeTraceDatabase();
  console.log("Database migrations completed successfully.");
}

try {
  await migrateDatabases();
} catch (error) {
  logError("Database migration failed", error);
  process.exitCode = 1;
} finally {
  closeDatabase();
  pokeTraceDb.close();
}
