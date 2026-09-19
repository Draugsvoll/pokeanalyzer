import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";
import {
  fetchPokeTraceCard,
  POKETRACE_CARD_ID_PATTERN,
} from "../services/pokeTraceApi.js";
import { savePokeTraceCards } from "../services/pokeTraceStore.js";

const apiKey = process.env.POKETRACE_API_KEY?.trim();
const id = process.argv[2];
if (!apiKey) {
  console.error("Set POKETRACE_API_KEY before importing a card");
  process.exit(1);
}
assertExplicitPokeTraceDatabaseTarget();
if (!id || !POKETRACE_CARD_ID_PATTERN.test(id)) {
  console.error("Pass a PokeTrace card UUID");
  process.exit(1);
}

try {
  const card = await fetchPokeTraceCard(apiKey, id);
  await savePokeTraceCards([card]);
  console.log(`Saved ${card.name} (${card.id})`);
  console.log(`Open /card/${card.id}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  pokeTraceDb.close();
}
