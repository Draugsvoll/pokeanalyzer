import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { runPokeTraceSetListGeneration } from "./pokeTraceSetListGenerationJob.js";

try {
  assertExplicitPokeTraceDatabaseTarget();
  await ensurePokeTraceReady();
  const result = await runPokeTraceSetListGeneration(pokeTraceDb);
  if (!result) {
    console.log(
      "PokeTrace maintenance job already running; set-list generation skipped",
    );
  } else {
    console.log(
      `${result.setListUpdated ? "Saved" : "Reused"} ${result.options.setNames.length} sets with ${result.options.setSummaries.length} market summaries`,
    );
    if (result.catalogGenerated) {
      console.log("Generated and saved the missing PokeTrace catalog first");
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  pokeTraceDb.close();
}
