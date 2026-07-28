// npm run db:check
import {
  assertExplicitDatabaseTarget,
  dbGet,
} from "../db/db.js";
import { assertDatabaseSchemaCompatible } from "../db/schemaValidation.js";
import { assertNewsContentSchemaCompatible } from "../db/newsStore.js";
import { logError } from "../security/logging.js";

async function checkDb() {
  try {
    assertExplicitDatabaseTarget();
    await assertDatabaseSchemaCompatible();
    await assertNewsContentSchemaCompatible();
    console.log("Database schema: compatible");

    const cards = await dbGet<{ count: number | bigint }>(
      "SELECT COUNT(*) AS count FROM cards",
    );
    console.log(`Cards: ${cards?.count ?? 0}`);

    const prices = await dbGet<{ count: number | bigint }>(
      "SELECT COUNT(*) AS count FROM price_snapshots",
    );
    console.log(`Price snapshots: ${prices?.count ?? 0}`);

    const newsFeeds = await dbGet<{ count: number | bigint }>(
      "SELECT COUNT(*) AS count FROM news_content",
    );
    console.log(`News feeds: ${newsFeeds?.count ?? 0}`);
  } catch (err) {
    logError("Failed to check database", err);
    process.exitCode = 1;
  }
}

void checkDb();
