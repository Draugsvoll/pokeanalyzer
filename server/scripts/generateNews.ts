import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  generalNewsInput,
  generalNewsInstructions,
  marketSummaryInput,
  marketSummaryInstructions,
} from "../../src/utils/grok/grokPrompts.js";
import { assertExplicitDatabaseTarget, closeDatabase } from "../db/db.js";
import {
  assertNewsContentSchemaCompatible,
  NEWS_FEEDS,
  saveNewsFeed,
} from "../db/newsStore.js";
import { saveMarketSummary } from "../db/marketSummaryStore.js";
import {
  chat,
  chatWithRawResponse,
  type GrokChatOptions,
} from "../services/xaiService.js";
import { parseGeneralNewsResponse } from "./newsGeneration.js";
import {
  MARKET_SUMMARY_GROK_OPTIONS,
  parseMarketSummaryResponse,
} from "./marketSummaryGeneration.js";
import {
  runNewsGenerationWorkflow,
  type NewsGenerationResult,
} from "./newsGenerationWorkflow.js";
import {
  acquireScriptLock,
  ensureScriptLockTable,
  releaseScriptLock,
  renewScriptLock,
  SCHEDULED_MAINTENANCE_LOCK_NAME,
  type ScriptLock,
} from "./scriptLocks.js";

const NEWS_GENERATION_LOCK_TTL_SECONDS = 15 * 60;
const DEBUG_LOCALLY = process.env.DEBUG_LOCALLY === "true";

async function saveRawResponse(
  responseName: string,
  payload: unknown,
): Promise<string> {
  const outputPath = path.join(
    tmpdir(),
    `pokeanalyzer-${responseName}-response-${Date.now()}.json`,
  );
  await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  return outputPath;
}

async function generateAndValidate<T>(
  name: string,
  userInput: string,
  instructions: string,
  parser: (responseText: string) => T,
  grokOptions: GrokChatOptions = {},
): Promise<T> {
  console.log(`Generating ${name}`);
  let responseText: string;
  let rawResponsePath: string | null = null;
  const requestOptions: GrokChatOptions = {
    ...grokOptions,
    instructions,
  };

  if (DEBUG_LOCALLY) {
    const response = await chatWithRawResponse(userInput, requestOptions);
    responseText = response.text;
    rawResponsePath = await saveRawResponse(name, {
      userInput,
      instructions,
      extractedText: response.text,
      rawResponse: response.rawResponse,
    });
    console.log(`${name} raw response saved to ${rawResponsePath}`);
  } else {
    responseText = await chat(userInput, requestOptions);
  }

  try {
    return parser(responseText);
  } catch (error) {
    const debugDetails = rawResponsePath
      ? ` Raw response saved to ${rawResponsePath}`
      : "";
    throw new Error(`${name} response failed validation.${debugDetails}`, {
      cause: error,
    });
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
  userInput: string,
  instructions: string,
  parser: (responseText: string) => T,
  describePayload: (payload: T) => string,
  grokOptions?: GrokChatOptions,
): Promise<NewsGenerationResult<T>> {
  try {
    const payload = await generateAndValidate(
      name,
      userInput,
      instructions,
      parser,
      grokOptions,
    );
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
  payload: T,
  dryRun: boolean,
  savePayload: (payload: T) => Promise<void>,
): Promise<Error | null> {
  if (dryRun) {
    return null;
  }

  try {
    await savePayload(payload);
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
    const failures = await runNewsGenerationWorkflow(
      {
        name: "latest news",
        generate: async () => {
          const result = await runGeneration(
            "latest_news",
            generalNewsInput,
            generalNewsInstructions,
            parseGeneralNewsResponse,
            (payload) => `${payload.items.length} items`,
          );
          await renewNewsLock(lock);
          return result;
        },
        save: async (payload) => {
          const error = await saveGeneration(
            "latest_news",
            payload,
            dryRun,
            (payload) => saveNewsFeed(NEWS_FEEDS.generalNews, payload),
          );
          await renewNewsLock(lock);
          return error;
        },
      },
      {
        name: "market summary",
        generate: async () => {
          const result = await runGeneration(
            "market_summary",
            marketSummaryInput,
            marketSummaryInstructions,
            (responseText) =>
              parseMarketSummaryResponse(
                responseText,
                new Date().toISOString(),
              ),
            (payload) =>
              `${
                payload.keyThemesAndChanges.length +
                payload.liquidity.length +
                payload.marketDrivers.length +
                payload.segmentSummary.length +
                payload.whatToWatch.length
              } detailed items`,
            MARKET_SUMMARY_GROK_OPTIONS,
          );
          await renewNewsLock(lock);
          return result;
        },
        save: async (payload) => {
          const error = await saveGeneration(
            "market_summary",
            payload,
            dryRun,
            saveMarketSummary,
          );
          await renewNewsLock(lock);
          return error;
        },
      },
    );

    for (const failure of failures) {
      console.warn(
        `NEWS WARNING [news_generation]: ${failure.name} failed; ${dryRun ? "no database rows were changed" : "the database row was not updated"}`,
      );
    }

    if (failures.length > 0) {
      const generationErrors = failures.map(({ error }) => error);
      throw new AggregateError(
        generationErrors,
        "News generation finished with errors",
        { cause: generationErrors[0] },
      );
    }

    console.log(
      dryRun
        ? "Dry run complete; both news feeds passed and no database rows changed"
        : "News generation finished successfully; both news feeds were updated",
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
