import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePokeTraceSavedResponses } from "../../shared/pokeTraceSavedResponses.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { toPokemonCard } from "../services/pokeTraceCardView.js";

const DEMO_SOURCE_CARD_ID = "019bff77-befa-771d-bab0-f5909f0a78c9";
const demoPath = path.resolve("public/demo-card.json");
const databaseUrl = process.env.POKETRACE_DATABASE_URL?.trim();

if (!databaseUrl || databaseUrl.startsWith("file:")) {
  throw new Error("Set POKETRACE_DATABASE_URL to the Turso database");
}
await ensurePokeTraceReady();

const result = await pokeTraceDb
  .execute({
    sql: "SELECT raw_json, saved_responses FROM poketrace_cards WHERE id = ?",
    args: [DEMO_SOURCE_CARD_ID],
  })
  .finally(() => pokeTraceDb.close());

const row = result.rows[0];
if (!row) throw new Error("The Base Set Charizard demo source card is missing");

const card = toPokemonCard(
  row.raw_json,
  parsePokeTraceSavedResponses(row.saved_responses),
  [],
);
const demoCard = {
  ...card,
  id: "demo",
  pokeTrace: {
    ...card.pokeTrace,
    variants: [
      {
        id: "demo",
        name: card.pokeTrace.variant?.trim() || "Holofoil",
      },
    ],
  },
};

await writeFile(demoPath, `${JSON.stringify(demoCard, null, 2)}\n`, "utf8");
console.log(`Wrote ${demoPath}`);
