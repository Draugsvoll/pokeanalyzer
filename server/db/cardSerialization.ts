type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseStoredCard(rawJson: string): JsonObject {
  const parsed: unknown = JSON.parse(rawJson);
  if (!isJsonObject(parsed)) {
    throw new Error("Stored card JSON must be an object");
  }
  return parsed;
}

/**
 * Application-owned analysis is kept in the database, but is only returned
 * through its authenticated feature routes.
 */
export function parsePublicStoredCard(rawJson: string): JsonObject {
  const card = { ...parseStoredCard(rawJson) };
  delete card.grok;
  return card;
}
