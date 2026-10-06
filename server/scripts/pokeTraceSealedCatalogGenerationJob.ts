import type { Client } from "@libsql/client";
import { generatePokeTraceSealedCatalog } from "../services/pokeTraceSealedCatalog.js";
import { savePokeTraceSealedCatalog } from "../services/pokeTraceSealedCatalogStore.js";

type CatalogDatabase = Pick<Client, "execute">;

export async function generateAndSavePokeTraceSealedCatalog(
  database: CatalogDatabase,
  assertHeld: () => void,
) {
  const catalog = await generatePokeTraceSealedCatalog(database);
  if (catalog.products.length === 0) {
    throw new Error("Cannot publish an empty PokeTrace sealed catalog");
  }
  assertHeld();
  await savePokeTraceSealedCatalog(database, catalog);
  return catalog;
}
