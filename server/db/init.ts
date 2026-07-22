import fs from "fs";
import path from "path";
import { db, splitSqlStatements } from "./db.js";
import { logError } from "../security/logging.js";

const schemaPath = path.resolve("server/db/schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

async function initializeDatabase() {
  try {
    const statements = splitSqlStatements(schema);
    for (const statement of statements) {
      await db.execute(statement);
    }
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize database");
    logError("Failed to initialize database", err);
    process.exit(1);
  }
}

void initializeDatabase();
