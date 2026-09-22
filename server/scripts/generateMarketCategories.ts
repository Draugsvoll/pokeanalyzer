import "dotenv/config";
import path from "node:path";
import {
  assertExplicitPokeTraceDatabaseTarget,
  ensurePokeTraceReady,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import {
  DEFAULT_MARKET_CATEGORIES_PATH,
  writeMarketCategories,
} from "../services/marketCategoryExport.js";

const configuredOutputPath = process.env.MARKET_CATEGORIES_OUTPUT_PATH?.trim();
const outputPath = configuredOutputPath
  ? path.resolve(configuredOutputPath)
  : DEFAULT_MARKET_CATEGORIES_PATH;

try {
  assertExplicitPokeTraceDatabaseTarget();
  await ensurePokeTraceReady();
  const payload = await writeMarketCategories(pokeTraceDb, outputPath);
  console.log(
    `Wrote ${payload.categories.length} market category result(s) to ${outputPath}`,
  );
} finally {
  pokeTraceDb.close();
}
