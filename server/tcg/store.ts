import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { parsePokeTraceSavedResponses } from "../../shared/pokeTraceSavedResponses.js";
import {
  isRecord,
  isTcgSnapshot,
  type TcgSnapshot,
} from "../../shared/tcgExplorer.js";

const reuseDays = 2;
export const TCG_CACHE_MS = reuseDays * 24 * 60 * 60 * 1000;
export async function getTcgCardContext(cardId: string) {
  await ensurePokeTraceReady();
  const result = await pokeTraceDb.execute({
    sql: "SELECT name, card_number, set_name, variant, tcgplayer_id, raw_json, saved_responses FROM poketrace_cards WHERE id = ?",
    args: [cardId],
  });
  const row = result.rows[0];
  if (!row) return null;
  const raw: unknown = JSON.parse(String(row.raw_json));
  const cached: unknown = parsePokeTraceSavedResponses(
    row.saved_responses,
  ).tcg_listings;
  return {
    name: String(row.name),
    cardNumber: String(row.card_number ?? ""),
    setName: String(row.set_name ?? ""),
    productId: Number(row.tcgplayer_id),
    printing: String(row.variant ?? ""),
    supportedGame:
      isRecord(raw) && raw.game === "pokemon" && raw.market === "US",
    cached,
  };
}
export function getCachedTcgSnapshot(
  value: unknown,
  filters: Pick<
    TcgSnapshot,
    "productId" | "printing" | "condition" | "language"
  >,
  now = Date.now(),
) {
  if (!isTcgSnapshot(value)) return null;
  const age = now - Date.parse(value.fetchedAt);
  return age >= 0 &&
    age < TCG_CACHE_MS &&
    value.sales !== null &&
    value.offers !== null &&
    value.productId === filters.productId &&
    value.printing === filters.printing &&
    value.condition === filters.condition &&
    value.language === filters.language
    ? value
    : null;
}
export async function saveTcgSnapshot(cardId: string, snapshot: TcgSnapshot) {
  if (
    !isTcgSnapshot(snapshot) ||
    snapshot.sales === null ||
    snapshot.offers === null
  )
    throw new Error("Cannot save incomplete TCG listings");
  await ensurePokeTraceReady();
  const result = await pokeTraceDb.execute({
    sql: "UPDATE poketrace_cards SET saved_responses = json_set(saved_responses, '$.tcg_listings', json(?)) WHERE id = ?",
    args: [JSON.stringify(snapshot), cardId],
  });
  if (result.rowsAffected !== 1) throw new Error("Card was not updated");
}
