import { db } from "./db.js";

type JsonObject = Record<string, unknown>;
const DAY_MS = 24 * 60 * 60 * 1000;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(value: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(
      value.replace(/^```(?:json)?\s*|\s*```$/gi, ""),
    );
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readCard(cardId: string): Promise<JsonObject | null> {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT raw_json FROM cards WHERE id = ?",
      [cardId],
      (error, row: { raw_json: string } | undefined) => {
        if (error) {
          reject(error);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }

        const card = parseJsonObject(row.raw_json);
        if (!card) {
          reject(new Error(`Card ${cardId} contains invalid JSON`));
          return;
        }
        resolve(card);
      },
    );
  });
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
  const rawCardNumber = card.number;
  const cardNumber =
    typeof rawCardNumber === "string"
      ? rawCardNumber.trim()
      : typeof rawCardNumber === "number" && Number.isFinite(rawCardNumber)
        ? String(rawCardNumber)
        : "";

  return {
    cardName,
    cardNameAndSet: [cardName, setName].filter(Boolean).join(" "),
    cardNumber,
    setName,
    storedResponse: getFreshFeatureResponse(card, storageKey, reuseDays),
  };
}

export async function saveCardGrokResponse(
  cardId: string,
  storageKey: string,
  response: unknown,
) {
  const parsedResponse = typeof response === "string"
    ? parseJsonObject(response)
    : isJsonObject(response)
      ? response
      : Array.isArray(response)
        ? { results: response }
        : null;
  if (!parsedResponse) return null;

  const storedResponse = {
    ...parsedResponse,
    timestamp: new Date().toISOString(),
  };
  const jsonPath = `$.grok.${storageKey}`;

  await new Promise<void>((resolve, reject) => {
    db.run(
      `
      UPDATE cards
      SET raw_json = json_set(raw_json, ?, json(?))
      WHERE id = ?
      `,
      [jsonPath, JSON.stringify(storedResponse), cardId],
      function onUpdate(error) {
        if (error) {
          reject(error);
          return;
        }
        if (this.changes !== 1) {
          reject(new Error(`Card ${cardId} was not updated`));
          return;
        }
        resolve();
      },
    );
  });

  return storedResponse;
}
