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

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOnlyTextItems(value: unknown) {
  return Array.isArray(value) && value.every(hasText);
}

function isAllowedText(value: unknown, allowed: ReadonlySet<string>) {
  return typeof value === "string" && allowed.has(value);
}

function isMarketScore(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 100;
  }

  return typeof value === "string" && /^(?:[1-9]\d?|100)$/.test(value);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (hasText(value) || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (isJsonObject(value)) {
    return Object.values(value).some(hasMeaningfulValue);
  }
  return false;
}

function hasMeaningfulField(value: JsonObject, fields: string[]) {
  return fields.some((field) => hasMeaningfulValue(value[field]));
}

const MARKET_BALANCE_LABELS = new Set([
  "buyer_favored",
  "balanced",
  "seller_favored",
  "unclear",
]);
const MARKET_OUTLOOK_LABELS = new Set([
  "very negative",
  "negative",
  "stable",
  "positive",
  "very positive",
]);

function isValidMarketSignal(value: unknown) {
  return (
    isJsonObject(value) &&
    isMarketScore(value.score) &&
    hasText(value.explanation)
  );
}

function isValidMarketOutlook(value: unknown) {
  return (
    isJsonObject(value) &&
    isAllowedText(value.label, MARKET_OUTLOOK_LABELS) &&
    hasText(value.explanation)
  );
}

function isValidMarketAnalysis(value: JsonObject) {
  const signals = isJsonObject(value.market_signals)
    ? value.market_signals
    : null;
  const outlook = isJsonObject(value.outlook) ? value.outlook : null;
  const evidenceQuality = isJsonObject(value.evidence_quality)
    ? value.evidence_quality
    : null;

  return Boolean(
    isMarketScore(value.score) &&
    hasText(value.explanation) &&
    hasText(value.headline) &&
    signals &&
    isValidMarketSignal(signals.demand) &&
    isValidMarketSignal(signals.liquidity) &&
    isValidMarketSignal(signals.momentum) &&
    isValidMarketSignal(signals.stability) &&
    hasText(value.strongest_segment) &&
    isAllowedText(value.market_balance, MARKET_BALANCE_LABELS) &&
    outlook &&
    isValidMarketOutlook(outlook.near_term) &&
    isValidMarketOutlook(outlook.long_term) &&
    hasOnlyTextItems(outlook.upside_drivers) &&
    hasOnlyTextItems(outlook.risks) &&
    evidenceQuality &&
    isMarketScore(evidenceQuality.score) &&
    hasText(evidenceQuality.reason),
  );
}

function isValidWorthGradingVariant(value: unknown) {
  return (
    isJsonObject(value) &&
    (isJsonObject(value.card) ||
      Array.isArray(value.graded_scenarios) ||
      isJsonObject(value.recommendation) ||
      isJsonObject(value.attractiveness_level))
  );
}

function isValidWorthGrading(value: JsonObject) {
  return (
    Array.isArray(value.variants) &&
    value.variants.length > 0 &&
    value.variants.every(isValidWorthGradingVariant)
  );
}

export function isValidStoredFeatureResponse(
  storageKey: string,
  value: unknown,
) {
  if (!isJsonObject(value)) return false;

  if (storageKey === "collectors_analysis") {
    return (
      Array.isArray(value.analyses) &&
      value.analyses.some(
        (analysis) =>
          isJsonObject(analysis) &&
          hasText(analysis.variant_name) &&
          Array.isArray(analysis.categories) &&
          analysis.categories.some(
            (category) =>
              isJsonObject(category) &&
              hasMeaningfulField(category, ["name", "score", "text"]),
          ),
      )
    );
  }

  if (storageKey === "market_analysis") {
    return isValidMarketAnalysis(value);
  }

  if (storageKey === "worth_grading") {
    return isValidWorthGrading(value);
  }

  if (storageKey === "ebay_sold") {
    return (
      isJsonObject(value.sold) &&
      Array.isArray(value.sold.items) &&
      isJsonObject(value.active) &&
      Array.isArray(value.active.items)
    );
  }

  return false;
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
  if (!isValidStoredFeatureResponse(storageKey, response)) {
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
  if (
    !parsedResponse ||
    !isValidStoredFeatureResponse(storageKey, parsedResponse)
  ) {
    return null;
  }

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
