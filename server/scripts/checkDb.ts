// npx tsx server/scripts/checkDb.ts
import { db } from "../db/db.js";
import { logError } from "../security/logging.js";

db.get("SELECT COUNT(*) AS count FROM cards", (err, row: { count: number }) => {
  if (err) {
    logError("Failed to count cards", err);
    return;
  }

  console.log(`Cards: ${row.count}`);

  db.get(
    "SELECT COUNT(*) AS count FROM price_snapshots",
    (err2, row2: { count: number }) => {
    if (err2) {
      logError("Failed to count price snapshots", err2);
      return;
    }

    console.log(`Price snapshots: ${row2.count}`);

      db.close();
    },
  );
});
