import { assertExplicitDatabaseTarget, closeDatabase } from "./db.js";
import { migratePrimaryDatabase } from "./migratePrimaryDatabase.js";
import { logError } from "../security/logging.js";

async function initializeDatabase() {
  try {
    assertExplicitDatabaseTarget();
    await migratePrimaryDatabase();
    console.log("Primary database migrations completed successfully.");
  } catch (err) {
    logError("Primary database migration failed", err);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

void initializeDatabase();
