import "dotenv/config";
import { requestPokeTraceSealedCatalogRefresh } from "../services/pokeTraceCatalogRefreshClient.js";

try {
  await requestPokeTraceSealedCatalogRefresh();
  console.log("Backend sealed search catalog force-refreshed");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
