import "dotenv/config";
import { randomUUID } from "node:crypto";
import { assertExplicitDatabaseTarget, closeDatabase } from "../db/db.js";
import {
  assertJustTcgQuerySchemaCompatible,
  ensureJustTcgQueryTable,
  JUST_TCG_QUERIES,
  saveJustTcgQuery,
  type JustTcgQuery,
} from "../db/justTcgQueryStore.js";
import {
  fetchJustTcgBiggestGainers,
  fetchJustTcgBiggestLosers,
} from "../services/justTcgApi.js";
import { fetchHydratedJustTcgMovers } from "../services/justTcgMoverCards.js";
import {
  acquireScriptLock,
  ensureScriptLockTable,
  releaseScriptLock,
  SCHEDULED_MAINTENANCE_LOCK_NAME,
  type ScriptLock,
} from "./scriptLocks.js";

const JUST_TCG_QUERIES_LOCK_TTL_SECONDS = 10 * 60;
const WEEKLY_MOVERS_PERIOD = "7d";

const JUST_TCG_QUERY_REFRESHES = [
  {
    fetch: fetchJustTcgBiggestGainers,
    name: "weekly gainers",
    query: JUST_TCG_QUERIES.biggestMovers,
  },
  {
    fetch: fetchJustTcgBiggestLosers,
    name: "weekly losers",
    query: JUST_TCG_QUERIES.biggestLosers,
  },
] as const;

function validateArguments(args: string[]): boolean {
  const supportedArguments = new Set(["--dry-run"]);
  const unsupportedArguments = args.filter(
    (argument) => !supportedArguments.has(argument),
  );

  if (unsupportedArguments.length > 0) {
    throw new Error(
      `Unsupported argument(s): ${unsupportedArguments.join(", ")}`,
    );
  }

  return args.includes("--dry-run");
}

async function refreshJustTcgQuery(
  name: string,
  fetchMovers: typeof fetchJustTcgBiggestGainers,
  query: JustTcgQuery,
  dryRun: boolean,
) {
  console.log(`Fetching JustTCG ${name}`);
  const cards = await fetchHydratedJustTcgMovers(
    fetchMovers,
    WEEKLY_MOVERS_PERIOD,
  );

  console.log(`JustTCG ${name} validated: ${cards.length} matched cards`);
  if (!dryRun) {
    await saveJustTcgQuery(query, WEEKLY_MOVERS_PERIOD, { cards });
    console.log(`JustTCG ${name} saved to SQL`);
  }
}

async function main(): Promise<void> {
  const dryRun = validateArguments(process.argv.slice(2));
  assertExplicitDatabaseTarget();
  await ensureScriptLockTable();
  await ensureJustTcgQueryTable();
  await assertJustTcgQuerySchemaCompatible();

  const lock: ScriptLock = {
    name: SCHEDULED_MAINTENANCE_LOCK_NAME,
    token: randomUUID(),
  };
  const acquired = await acquireScriptLock(
    lock.name,
    lock.token,
    JUST_TCG_QUERIES_LOCK_TTL_SECONDS,
  );
  if (!acquired) {
    throw new Error(
      "Another scheduled maintenance job is already running; no live changes were made",
    );
  }

  try {
    for (const refresh of JUST_TCG_QUERY_REFRESHES) {
      await refreshJustTcgQuery(
        refresh.name,
        refresh.fetch,
        refresh.query,
        dryRun,
      );
    }

    console.log(
      dryRun
        ? "Dry run complete; no JustTCG query rows changed"
        : `JustTCG query refresh finished successfully; ${JUST_TCG_QUERY_REFRESHES.length} database rows updated`,
    );
  } finally {
    const released = await releaseScriptLock(lock);
    if (!released) {
      console.warn(
        "JUSTTCG WARNING [lock_release]: The maintenance lock was already released or replaced",
      );
    }
  }
}

main()
  .catch((error: unknown) => {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    console.error("JustTCG query refresh failed", {
      name: normalizedError.name,
      message: normalizedError.message,
    });

    if (normalizedError.cause instanceof Error) {
      console.error("Root error", normalizedError.cause.message);
    }

    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
  });
