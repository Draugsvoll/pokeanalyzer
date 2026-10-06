import { spawn } from "node:child_process";
import path from "node:path";
import {
  pokeTraceDailyRefreshExitCode,
  runPokeTraceDailyRefreshes,
} from "./pokeTraceDailyRefreshRunner.js";

function runScript(script: string) {
  return new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.resolve(script)],
      {
        env: process.env,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("error", (error) => {
      console.error(`Could not start ${script}: ${error.message}`);
      resolve(1);
    });
    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(`${script} stopped by signal ${signal}`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

const scripts = {
  singles: "server/scripts/refreshOldestPokeTraceCards.ts",
  sealed: "server/scripts/refreshPokeTraceSealedProducts.ts",
} as const;
const statuses = await runPokeTraceDailyRefreshes((job) =>
  runScript(scripts[job]),
);

console.log("");
console.log("=== Combined PokeTrace daily refresh ===");
console.log(`Singles: ${statuses.singles === 0 ? "SUCCESS" : "FAILED"}`);
console.log(`Sealed: ${statuses.sealed === 0 ? "SUCCESS" : "FAILED"}`);
console.log("========================================");

process.exitCode = pokeTraceDailyRefreshExitCode(statuses);
