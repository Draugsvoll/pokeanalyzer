import "dotenv/config";
import { randomUUID } from "node:crypto";
import { assertExplicitDatabaseTarget, closeDatabase } from "../db/db.js";
import {
  assertJustTcgCategorySchemaCompatible,
  ensureJustTcgCategoryTable,
  JUST_TCG_CATEGORIES,
  saveJustTcgCategory,
  type JustTcgCategory,
} from "../db/justTcgCategoryStore.js";
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

const JUST_TCG_CATEGORIES_LOCK_TTL_SECONDS = 10 * 60;
const JUST_TCG_CATEGORY_PERIODS = ["7d", "30d"] as const;

const JUST_TCG_CATEGORY_REFRESHES = [
  {
    category: JUST_TCG_CATEGORIES.biggestMovers,
    fetch: fetchJustTcgBiggestGainers,
    name: "gainers",
  },
  {
    category: JUST_TCG_CATEGORIES.biggestLosers,
    fetch: fetchJustTcgBiggestLosers,
    name: "losers",
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

async function refreshJustTcgCategory(
  name: string,
  fetchMovers: typeof fetchJustTcgBiggestGainers,
  category: JustTcgCategory,
  period: (typeof JUST_TCG_CATEGORY_PERIODS)[number],
  dryRun: boolean,
) {
  console.log(`Fetching JustTCG ${name} (${period})`);
  const cards = await fetchHydratedJustTcgMovers(fetchMovers, period);

  console.log(
    `JustTCG ${name} (${period}) validated: ${cards.length} matched cards`,
  );
  if (!dryRun) {
    await saveJustTcgCategory(category, period, { cards });
    console.log(`JustTCG ${name} (${period}) saved to SQL`);
  }
}

async function main(): Promise<void> {
  const dryRun = validateArguments(process.argv.slice(2));
  assertExplicitDatabaseTarget();
  await ensureScriptLockTable();
  await ensureJustTcgCategoryTable();
  await assertJustTcgCategorySchemaCompatible();

  const lock: ScriptLock = {
    name: SCHEDULED_MAINTENANCE_LOCK_NAME,
    token: randomUUID(),
  };
  const acquired = await acquireScriptLock(
    lock.name,
    lock.token,
    JUST_TCG_CATEGORIES_LOCK_TTL_SECONDS,
  );
  if (!acquired) {
    throw new Error(
      "Another scheduled maintenance job is already running; no live changes were made",
    );
  }

  try {
    for (const refresh of JUST_TCG_CATEGORY_REFRESHES) {
      for (const period of JUST_TCG_CATEGORY_PERIODS) {
        await refreshJustTcgCategory(
          refresh.name,
          refresh.fetch,
          refresh.category,
          period,
          dryRun,
        );
      }
    }

    const updatedRows =
      JUST_TCG_CATEGORY_REFRESHES.length * JUST_TCG_CATEGORY_PERIODS.length;
    console.log(
      dryRun
        ? "Dry run complete; no JustTCG category rows changed"
        : `JustTCG category refresh finished successfully; ${updatedRows} database rows updated`,
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
    console.error("JustTCG category refresh failed", {
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
