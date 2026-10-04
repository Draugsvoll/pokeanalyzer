import "dotenv/config";
import { requestPokeTraceCatalogRefresh } from "../services/pokeTraceCatalogRefreshClient.js";

try {
  await requestPokeTraceCatalogRefresh();
  console.log("Backend search catalog force-refreshed");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
