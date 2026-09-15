import "dotenv/config";
import { pkmnPricesDb } from "../db/pkmnPricesDb.js";
import { importPkmnPricesCard } from "../services/pkmnPricesImport.js";

const id = Number(process.argv[2]);
const key = process.env.PKMNPRICES_API_KEY?.trim();
if (!Number.isSafeInteger(id) || id < 1 || !key) {
  console.error(
    "Usage: PKMNPRICES_API_KEY=... npm run pkmn:import-card -- <card-id>",
  );
  process.exit(1);
}

try {
  const name = await importPkmnPricesCard(id, key);
  console.log(`Imported ${name} as /card/pkmn-${id}`);
} finally {
  pkmnPricesDb.close();
}
