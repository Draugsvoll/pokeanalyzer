export function parseJsonText(text: string): unknown | null {
  let value: unknown = text.trim();

  if (typeof value === "string" && value.startsWith("```") && value.endsWith("```")) {
    value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  for (let attempt = 0; attempt < 3 && typeof value === "string"; attempt += 1) {
    const source = value.trim();
    const withoutWrappingQuotes =
      source.length >= 2 && source.startsWith("'") && source.endsWith("'")
        ? source.slice(1, -1)
        : source;

    try {
      value = JSON.parse(withoutWrappingQuotes);
    } catch {
      return null;
    }
  }

  return value;
}
