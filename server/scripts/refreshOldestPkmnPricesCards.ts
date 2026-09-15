import "dotenv/config";
import { pkmnPricesDb, pkmnPricesReady } from "../db/pkmnPricesDb.js";
import { importPkmnPricesCard } from "../services/pkmnPricesImport.js";

const key = process.env.PKMNPRICES_API_KEY?.trim();
if (!key) {
  console.error("Set PKMNPRICES_API_KEY before refreshing cards");
  process.exit(1);
}

const limit = Number(process.argv[2] ?? "50");
const requestGapMs = 2500;
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
  console.error("Refresh limit must be an integer between 1 and 5000");
  process.exit(1);
}

try {
  await pkmnPricesReady;
  const result = await pkmnPricesDb.execute({
    sql: "SELECT id, fetched_at FROM pkmn_cards ORDER BY fetched_at ASC, id ASC LIMIT ?",
    args: [limit],
  });

  if (result.rows.length === 0) {
    console.log("No PkmnPrices cards to refresh");
  }

  let updated = 0;
  for (const [index, row] of result.rows.entries()) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, requestGapMs));
    }
    const id = Number(row.id);
    try {
      const name = await importPkmnPricesCard(id, key);
      updated += 1;
      console.log(
        `Updated ${name} (${id}); previously fetched ${row.fetched_at}`,
      );
    } catch (error) {
      console.error(`Could not refresh card ${id}`, error);
      process.exitCode = 1;
    }
  }
  console.log(`Refreshed ${updated}/${result.rows.length} oldest cards`);
} finally {
  pkmnPricesDb.close();
}
