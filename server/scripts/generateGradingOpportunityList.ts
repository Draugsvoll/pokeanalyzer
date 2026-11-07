import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import { runGradingOpportunityListGeneration } from "./gradingOpportunityListGenerationJob.js";

try {
  assertExplicitPokeTraceDatabaseTarget();
  await ensurePokeTraceReady();
  const payload = await runGradingOpportunityListGeneration(pokeTraceDb);
  console.log(
    payload
      ? `Saved ${payload.items.length} qualifying grading cards to the PokeTrace database`
      : "PokeTrace maintenance job already running; grading list generation skipped",
  );
} finally {
  pokeTraceDb.close();
}
