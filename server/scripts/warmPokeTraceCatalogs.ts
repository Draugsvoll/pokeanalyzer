import "dotenv/config";
import {
  requestPokeTraceCatalogRefresh,
  requestPokeTraceSealedCatalogRefresh,
} from "../services/pokeTraceCatalogRefreshClient.js";

try {
  await Promise.all([
    requestPokeTraceCatalogRefresh(),
    requestPokeTraceSealedCatalogRefresh(),
  ]);
  console.log("Backend Singles and Sealed search catalogs force-refreshed");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
