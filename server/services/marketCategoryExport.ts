import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@libsql/client";
import {
  MARKET_CATEGORY_DEFINITIONS,
  type MarketCategoryDefinition,
} from "../config/marketCategories.js";
import { findMostSold, findPriceMovers } from "./marketCategoryQueries.js";

export const DEFAULT_MARKET_CATEGORIES_PATH = path.resolve(
  "public/market-categories.json",
);

async function writeFileAtomically(outputPath: string, contents: string) {
  const directory = path.dirname(outputPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function generateMarketCategories(
  database: Pick<Client, "execute">,
  definitions: readonly MarketCategoryDefinition[] = MARKET_CATEGORY_DEFINITIONS,
) {
  const ids = new Set<string>();
  const categories = [];

  for (const definition of definitions) {
    if (!definition.id.trim() || ids.has(definition.id)) {
      throw new Error(`Market category id must be unique: ${definition.id}`);
    }
    ids.add(definition.id);

    const result =
      definition.query === "priceMovers"
        ? await findPriceMovers(database, definition.parameters)
        : await findMostSold(database, definition.parameters);
    categories.push({
      id: definition.id,
      query: definition.query,
      title: definition.title,
      ...result,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories,
  };
}

export async function writeMarketCategories(
  database: Pick<Client, "execute">,
  outputPath = DEFAULT_MARKET_CATEGORIES_PATH,
  definitions: readonly MarketCategoryDefinition[] = MARKET_CATEGORY_DEFINITIONS,
) {
  const payload = await generateMarketCategories(database, definitions);
  await writeFileAtomically(
    outputPath,
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  return payload;
}
