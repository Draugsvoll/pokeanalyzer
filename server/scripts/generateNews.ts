import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  getBiggestMovers,
  getGeneralNewsPrompt,
} from "../../src/utils/grok/grokPrompts.js";
import { assertExplicitDatabaseTarget, closeDatabase } from "../db/db.js";
import {
  assertNewsContentSchemaCompatible,
  NEWS_FEEDS,
  saveNewsFeed,
} from "../db/newsStore.js";
import { chat } from "../services/xaiService.js";
import {
  parseBiggestMoversResponse,
  parseGeneralNewsResponse,
} from "./newsGeneration.js";
import {
  acquireScriptLock,
  ensureScriptLockTable,
  releaseScriptLock,
  renewScriptLock,
  SCHEDULED_MAINTENANCE_LOCK_NAME,
  type ScriptLock,
} from "./scriptLocks.js";

const NEWS_GENERATION_LOCK_TTL_SECONDS = 15 * 60;

async function saveInvalidResponse(
  responseName: string,
  responseText: string,
): Promise<string> {
  const outputPath = path.join(
    tmpdir(),
    `pokeanalyzer-${responseName}-response-${Date.now()}.txt`,
  );
  await writeFile(outputPath, responseText, "utf8");
  return outputPath;
}

async function generateAndValidate<T>(
  name: string,
  prompt: string,
  parser: (responseText: string) => T,
): Promise<T> {
  console.log(`Generating ${name}`);
  const responseText = await chat(prompt);

  try {
    return parser(responseText);
  } catch (error) {
    const rawResponsePath = await saveInvalidResponse(name, responseText);
    throw new Error(
      `${name} response failed validation. Raw response saved to ${rawResponsePath}`,
      { cause: error },
    );
  }
}

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

type GenerationResult<T> =
  { ok: true; payload: T } | { ok: false; error: Error };

async function renewNewsLock(lock: ScriptLock): Promise<void> {
  const renewed = await renewScriptLock(
    lock.name,
    lock.token,
    NEWS_GENERATION_LOCK_TTL_SECONDS,
  );
  if (!renewed) {
    throw new Error("The news generation lock was lost");
  }
}

async function runGeneration<T>(
  name: string,
  prompt: string,
  parser: (responseText: string) => T,
  describePayload: (payload: T) => string,
): Promise<GenerationResult<T>> {
  try {
    const payload = await generateAndValidate(name, prompt, parser);
    console.log(`${name} validated: ${describePayload(payload)}`);
    return { ok: true, payload };
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    console.error(`NEWS ERROR [${name}]`, normalizedError.message);

    if (normalizedError.cause instanceof Error) {
      console.error(
        `NEWS ERROR [${name} validation]`,
        normalizedError.cause.message,
      );
    }

    return { ok: false, error: normalizedError };
  }
}

async function saveGeneration<T>(
  name: string,
  result: GenerationResult<T>,
  dryRun: boolean,
  savePayload: (payload: T) => Promise<void>,
): Promise<Error | null> {
  if (!result.ok) {
    return result.error;
  }
  if (dryRun) {
    return null;
  }

  try {
    await savePayload(result.payload);
    console.log(`${name} saved to SQL`);
    return null;
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    console.error(`NEWS ERROR [${name} save]`, normalizedError.message);
    return normalizedError;
  }
}

async function main(): Promise<void> {
  const dryRun = validateArguments(process.argv.slice(2));
  assertExplicitDatabaseTarget();
  await ensureScriptLockTable();
  await assertNewsContentSchemaCompatible();

  const lock: ScriptLock = {
    name: SCHEDULED_MAINTENANCE_LOCK_NAME,
    token: randomUUID(),
  };
  const acquired = await acquireScriptLock(
    lock.name,
    lock.token,
    NEWS_GENERATION_LOCK_TTL_SECONDS,
  );
  if (!acquired) {
    throw new Error(
      "Another scheduled maintenance job is already running; no live changes were made",
    );
  }

  try {
    await renewNewsLock(lock);
    const generalNewsResult = await runGeneration(
      "latest_news",
      getGeneralNewsPrompt,
      parseGeneralNewsResponse,
      (payload) => `${payload.items.length} items`,
    );
    await renewNewsLock(lock);

    const biggestMoversResult = await runGeneration(
      "biggest_movers",
      getBiggestMovers,
      parseBiggestMoversResponse,
      (payload) => `${payload.cards.length} cards`,
    );
    await renewNewsLock(lock);

    const taskErrors = (
      await Promise.all([
        saveGeneration("latest_news", generalNewsResult, dryRun, (payload) =>
          saveNewsFeed(NEWS_FEEDS.generalNews, payload),
        ),
        saveGeneration("biggest_movers", biggestMoversResult, dryRun, (payload) =>
          saveNewsFeed(NEWS_FEEDS.biggestMovers, payload),
        ),
      ])
    ).filter((error): error is Error => error !== null);
    await renewNewsLock(lock);

    if (taskErrors.length > 0) {
      const successfulTasks = 2 - taskErrors.length;
      console.warn(
        `NEWS WARNING [partial_run]: ${taskErrors.length} of 2 tasks failed; ${
          dryRun
            ? "no database rows were changed"
            : `${successfulTasks} database row(s) were updated`
        }`,
      );
      throw new AggregateError(
        taskErrors,
        "News generation finished with errors",
        { cause: taskErrors[0] },
      );
    }

    console.log(
      dryRun
        ? "Dry run complete; both responses passed and no database rows changed"
        : "News generation finished successfully; 2 database rows updated",
    );
  } finally {
    const released = await releaseScriptLock(lock);
    if (!released) {
      console.warn(
        "NEWS WARNING [lock_release]: The news generation lock was already released or replaced",
      );
    }
  }
}

main()
  .catch((error: unknown) => {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    console.error("News generation failed", {
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
