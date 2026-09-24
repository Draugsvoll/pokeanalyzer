import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { runMarketCategoryGeneration } from "./marketCategoryGenerationJob.js";

try {
  assertExplicitPokeTraceDatabaseTarget();
  await ensurePokeTraceReady();
  const payload = await runMarketCategoryGeneration(pokeTraceDb);
  if (payload) {
    console.log(
      `Saved ${payload.categories.length} market category result(s) to the PokeTrace database`,
    );
  } else {
    console.log(
      "PokeTrace maintenance job already running; market category generation skipped",
    );
  }
} finally {
  pokeTraceDb.close();
}
