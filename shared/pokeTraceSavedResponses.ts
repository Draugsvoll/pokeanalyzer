export type JsonRecord = Record<string, unknown>;

export type PokeTraceSavedResponses = JsonRecord & {
  grok?: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parsePokeTraceSavedResponses(
  value: unknown,
): PokeTraceSavedResponses {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
