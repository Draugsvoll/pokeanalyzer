import assert from "node:assert/strict";
import test from "node:test";
import {
  pokeTraceDailyRefreshExitCode,
  runPokeTraceDailyRefreshes,
} from "./pokeTraceDailyRefreshRunner.js";

test("combined daily refresh always runs sealed after singles fails", async () => {
  const jobs: string[] = [];
  const statuses = await runPokeTraceDailyRefreshes(async (job) => {
    jobs.push(job);
    return job === "singles" ? 1 : 0;
  });

  assert.deepEqual(jobs, ["singles", "sealed"]);
  assert.deepEqual(statuses, { singles: 1, sealed: 0 });
  assert.equal(pokeTraceDailyRefreshExitCode(statuses), 1);
  assert.equal(pokeTraceDailyRefreshExitCode({ singles: 0, sealed: 0 }), 0);
});
