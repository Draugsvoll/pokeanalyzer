import "dotenv/config";
import { assertExplicitDatabaseTarget, closeDatabase, dbExecute } from "../db/db.js";
import { JUST_TCG_CATEGORIES_TABLE_SQL } from "../db/justTcgCategoryStore.js";
import { logError } from "../security/logging.js";

async function main(): Promise<void> {
  assertExplicitDatabaseTarget();

  await dbExecute('DROP TABLE IF EXISTS "justtcg_categories"');
  await dbExecute(JUST_TCG_CATEGORIES_TABLE_SQL);

  console.log("JustTCG categories table reset successfully.");
}

main()
  .catch((error: unknown) => {
    console.error("Failed to reset JustTCG categories table");
    logError("Failed to reset JustTCG categories table", error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
  });
