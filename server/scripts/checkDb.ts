// npx tsx server/scripts/checkDb.ts
import { db } from "../db/db.js";

db.get("SELECT COUNT(*) AS count FROM cards", (err, row: any) => {
  if (err) {
    console.error(err);
    return;
  }

  console.log(`Cards: ${row.count}`);

  db.get("SELECT COUNT(*) AS count FROM price_snapshots", (err2, row2: any) => {
    if (err2) {
      console.error(err2);
      return;
    }

    console.log(`Price snapshots: ${row2.count}`);

    db.close();
  });
});
