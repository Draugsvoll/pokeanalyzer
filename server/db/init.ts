import fs from "fs";
import path from "path";
import {
  assertExplicitDatabaseTarget,
  db,
  splitSqlStatements,
} from "./db.js";
import { assertDatabaseSchemaCompatible } from "./schemaValidation.js";
import { assertNewsContentSchemaCompatible } from "./newsStore.js";
import { logError } from "../security/logging.js";

const schemaPath = path.resolve("server/db/schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

async function initializeDatabase() {
  try {
    assertExplicitDatabaseTarget();
    const statements = splitSqlStatements(schema);
    for (const statement of statements) {
      await db.execute(statement);
    }
    await assertDatabaseSchemaCompatible();
    await assertNewsContentSchemaCompatible();
    console.log("Database initialized and schema verified successfully.");
  } catch (err) {
    console.error("Failed to initialize database");
    logError("Failed to initialize database", err);
    process.exit(1);
  }
}

void initializeDatabase();
