import { dbGet, dbRun } from "./db.js";
import {
  formatCardNumber,
  formatUnpaddedCardNumber,
} from "../../shared/formatCardNumber.js";

type JsonObject = Record<string, unknown>;
const DAY_MS = 24 * 60 * 60 * 1000;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(value: string): JsonObject | null {
  const parsed = parseJsonValue(value);
  return isJsonObject(parsed) ? parsed : null;
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/gi, ""));
  } catch {
    return null;
  }
}

async function readCard(cardId: string): Promise<JsonObject | null> {
  const row = await dbGet<{ raw_json: string }>(
    "SELECT raw_json FROM cards WHERE id = ?",
    [cardId],
  );
  if (!row) return null;

  const card = parseJsonObject(String(row.raw_json));
  if (!card) {
    throw new Error(`Card ${cardId} contains invalid JSON`);
  }
  return card;
}

function getFreshFeatureResponse(
  card: JsonObject,
  storageKey: string,
  reuseDays: number,
) {
  const grok = card.grok;
  if (!isJsonObject(grok)) return null;

  const response = grok[storageKey];
  if (!isJsonObject(response) || typeof response.timestamp !== "string") {
    return null;
  }

  const timestamp = Date.parse(response.timestamp);
  const age = Date.now() - timestamp;
  const maxAge = reuseDays * DAY_MS;
  if (!Number.isFinite(timestamp) || age < 0 || age >= maxAge) return null;

  return response;
}

export async function getCardGrokContext(
  cardId: string,
  storageKey: string,
  reuseDays: number,
) {
  const card = await readCard(cardId);
  if (!card) return null;

  const set = isJsonObject(card.set) ? card.set : null;
  const cardName = typeof card.name === "string" ? card.name.trim() : "";
  const setName = typeof set?.name === "string" ? set.name.trim() : "";
  const rarity = typeof card.rarity === "string" ? card.rarity.trim() : "";
  const rawCardNumber = card.number;
  const cardNumber =
    typeof rawCardNumber === "string"
      ? rawCardNumber.trim()
      : typeof rawCardNumber === "number" && Number.isFinite(rawCardNumber)
        ? String(rawCardNumber)
        : "";
  const rawPrintedTotal = set?.printedTotal;
  const printedTotal =
    typeof rawPrintedTotal === "number" && Number.isFinite(rawPrintedTotal)
      ? rawPrintedTotal
      : undefined;

  return {
    cardName,
    cardNameAndSet: [cardName, setName].filter(Boolean).join(" "),
    cardPromptIdentity: [cardName, cardNumber, setName]
      .filter(Boolean)
      .join(" "),
    cardNumber,
    formattedCardNumber:
      formatCardNumber({ number: cardNumber, set: { printedTotal } }) ??
      cardNumber,
    unpaddedCardNumber:
      formatUnpaddedCardNumber({
        number: cardNumber,
        set: { printedTotal },
      }) ?? cardNumber,
    rarity,
    setName,
    storedResponse: getFreshFeatureResponse(card, storageKey, reuseDays),
  };
}

export async function saveCardGrokResponse(
  cardId: string,
  storageKey: string,
  response: unknown,
) {
  const parsedStringResponse =
    typeof response === "string" ? parseJsonValue(response) : null;
  const parsedResponse =
    typeof response === "string"
      ? isJsonObject(parsedStringResponse)
        ? parsedStringResponse
        : null
      : isJsonObject(response)
        ? response
        : null;
  if (!parsedResponse) return null;

  const storedResponse = {
    ...parsedResponse,
    timestamp: new Date().toISOString(),
  };
  const jsonPath = `$.grok.${storageKey}`;

  const result = await dbRun(
    `
    UPDATE cards
    SET raw_json = json_set(raw_json, ?, json(?))
    WHERE id = ?
    `,
    [jsonPath, JSON.stringify(storedResponse), cardId],
  );

  if (result.changes !== 1) {
    throw new Error(`Card ${cardId} was not updated`);
  }

  return storedResponse;
}
