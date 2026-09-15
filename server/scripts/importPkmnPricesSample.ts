import "dotenv/config";
import { pkmnPricesDb } from "../db/pkmnPricesDb.js";
import { importPkmnPricesCard } from "../services/pkmnPricesImport.js";

const key = process.env.PKMNPRICES_API_KEY?.trim();
if (!key) {
  console.error("Set PKMNPRICES_API_KEY before importing cards");
  process.exit(1);
}

type CardList = { data: { id: number }[] };

try {
  const response = await fetch(
    "https://api.pkmnprices.com/v1/cards?language=English&per_page=20&page=1",
    { headers: { "X-API-Key": key } },
  );
  if (!response.ok) {
    throw new Error(`PkmnPrices card list returned HTTP ${response.status}`);
  }
  const value: unknown = await response.json();
  const list = value as CardList;
  if (
    !list ||
    typeof list !== "object" ||
    !Array.isArray(list.data) ||
    list.data.length > 20 ||
    !list.data.every((card) => Number.isSafeInteger(card.id) && card.id > 0)
  ) {
    throw new Error("PkmnPrices returned an invalid card list");
  }

  let imported = 0;
  for (const { id } of list.data) {
    const name = await importPkmnPricesCard(id, key);
    imported += 1;
    console.log(`${imported}/${list.data.length}: ${name} (${id})`);
  }
  console.log(`Imported ${imported} English cards. Browse /pkmn-search`);
} finally {
  pkmnPricesDb.close();
}
