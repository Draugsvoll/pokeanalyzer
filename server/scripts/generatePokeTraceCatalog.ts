import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { runPokeTraceCatalogGeneration } from "./pokeTraceCatalogGenerationJob.js";

try {
  assertExplicitPokeTraceDatabaseTarget();
  await ensurePokeTraceReady();
  const catalog = await runPokeTraceCatalogGeneration(pokeTraceDb);
  if (catalog) {
    console.log(
      `Saved ${catalog.cards.length} cards to the browser search catalog`,
    );
  } else {
    console.log(
      "PokeTrace maintenance job already running; catalog generation skipped",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  pokeTraceDb.close();
}
