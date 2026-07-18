import fs from "fs";
import path from "path";
import { db } from "./db.js";
import { logError } from "../security/logging.js";

const schemaPath = path.resolve("server/db/schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

db.exec(schema, (err) => {
  if (err) {
    console.error("❌ Failed to initialize database");
    logError("Failed to initialize database", err);
    process.exit(1);
  }

  console.log("✅ Database initialized successfully.");

  db.close((closeErr) => {
    if (closeErr) {
      logError("Failed to close database", closeErr);
    } else {
      console.log("SQLite connection closed.");
    }
  });
});
