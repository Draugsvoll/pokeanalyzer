import fs from "fs";
import path from "path";
import { db } from "./db.js";

const schemaPath = path.resolve("server/db/schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

db.exec(schema, (err) => {
  if (err) {
    console.error("❌ Failed to initialize database");
    console.error(err.message);
    process.exit(1);
  }

  console.log("✅ Database initialized successfully.");

  db.close((closeErr) => {
    if (closeErr) {
      console.error("Failed to close database:", closeErr.message);
    } else {
      console.log("SQLite connection closed.");
    }
  });
});