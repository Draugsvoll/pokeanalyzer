import type { GeneralNewsPayload } from "../../src/types/news.js";

type JsonRecord = Record<string, unknown>;

export type { GeneralNewsPayload };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
  allowEmpty = false,
): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function requiredUrl(value: unknown, field: string): string {
  const url = requiredString(value, field);

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error();
    }
  } catch {
    throw new Error(`${field} must be a valid HTTP URL`);
  }

  return url;
}

function optionalUrl(value: unknown, field: string): string {
  if (value == null || value === "") return "";
  return requiredUrl(value, field);
}

function parseJsonResponse(responseText: string): unknown {
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new Error("response contained invalid JSON");
  }
}

export function parseGeneralNewsResponse(
  responseText: string,
): GeneralNewsPayload {
  const payload = parseJsonResponse(responseText);
  if (!isRecord(payload)) {
    throw new Error("latest news response must be a JSON object");
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error("latest news response must contain at least one item");
  }

  return {
    date: requiredString(payload.date, "date"),
    items: payload.items.map((item, index) => {
      if (!isRecord(item)) {
        throw new Error(`items[${index}] must be an object`);
      }
      if (!Array.isArray(item.action)) {
        throw new Error(`items[${index}].action must be an array`);
      }

      return {
        headline: requiredString(item.headline, `items[${index}].headline`),
        label: requiredString(item.label, `items[${index}].label`),
        summary: requiredString(item.summary, `items[${index}].summary`),
        action: item.action.map((action, actionIndex) =>
          requiredString(action, `items[${index}].action[${actionIndex}]`),
        ),
        url: optionalUrl(item.url, `items[${index}].url`),
      };
    }),
  };
}
