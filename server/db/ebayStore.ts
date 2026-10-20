import { ensurePokeTraceReady, pokeTraceDb } from "./pokeTraceDb.js";
import {
  parsePokeTraceSavedResponses,
  type JsonRecord,
  type PokeTraceSavedResponses,
} from "../../shared/pokeTraceSavedResponses.js";

const EBAY_CACHE_MS = 4 * 24 * 60 * 60 * 1000;

export type EbayListingsResponse = JsonRecord & {
  active: JsonRecord & { items: unknown[] };
  sold: JsonRecord & { items: unknown[] };
};

export type StoredEbayResponse = EbayListingsResponse & {
  request_query: string;
  timestamp: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isCompleteEbayResponse(
  value: unknown,
): value is EbayListingsResponse {
  return (
    isRecord(value) &&
    isRecord(value.active) &&
    Array.isArray(value.active.items) &&
    isRecord(value.sold) &&
    Array.isArray(value.sold.items)
  );
}

export function getStoredEbayResponse(
  savedResponses: PokeTraceSavedResponses,
  query: string,
  now = Date.now(),
): StoredEbayResponse | null {
  // Legacy results remain usable during the four-day migration window.
  const legacy = isRecord(savedResponses.grok)
    ? savedResponses.grok.ebay_sold
    : null;
  for (const response of [savedResponses.ebay, legacy]) {
    if (
      !isCompleteEbayResponse(response) ||
      response.request_query !== query ||
      typeof response.timestamp !== "string"
    ) {
      continue;
    }
    const timestamp = Date.parse(response.timestamp);
    const age = now - timestamp;
    if (!Number.isFinite(timestamp) || age < 0 || age >= EBAY_CACHE_MS) {
      continue;
    }
    return response as StoredEbayResponse;
  }
  return null;
}

export async function getCardEbayContext(cardId: string) {
  await ensurePokeTraceReady();
  const result = await pokeTraceDb.execute({
    sql: "SELECT raw_json, saved_responses FROM poketrace_cards WHERE id = ?",
    args: [cardId],
  });
  const row = result.rows[0];
  if (!row) return null;
  const card: unknown = JSON.parse(String(row.raw_json));
  if (!isRecord(card)) {
    throw new Error(`Card ${cardId} contains invalid JSON`);
  }

  const cardName = typeof card.name === "string" ? card.name.trim() : "";
  const rawCardNumber = card.cardNumber;
  const cardNumber =
    typeof rawCardNumber === "string"
      ? rawCardNumber.trim()
      : typeof rawCardNumber === "number" && Number.isFinite(rawCardNumber)
        ? String(rawCardNumber)
        : "";
  return {
    cardName,
    cardNumber,
    savedResponses: parsePokeTraceSavedResponses(row.saved_responses),
  };
}

export async function saveCardEbayResponse(cardId: string, response: unknown) {
  if (
    !isCompleteEbayResponse(response) ||
    typeof response.request_query !== "string" ||
    !response.request_query.trim()
  ) {
    return null;
  }
  const storedResponse: StoredEbayResponse = {
    ...response,
    request_query: response.request_query,
    timestamp: new Date().toISOString(),
  };
  await ensurePokeTraceReady();
  const result = await pokeTraceDb.execute({
    sql: `
      UPDATE poketrace_cards
      SET saved_responses = json_set(saved_responses, '$.ebay', json(?))
      WHERE id = ?
    `,
    args: [JSON.stringify(storedResponse), cardId],
  });
  if (result.rowsAffected !== 1) {
    throw new Error(`Card ${cardId} was not updated`);
  }
  return storedResponse;
}
