import { ensurePokeTraceReady, pokeTraceDb } from "./pokeTraceDb.js";
import { parsePokeTraceSavedResponses } from "../../shared/pokeTraceSavedResponses.js";
import { isValidWorthGradingResponse } from "../../shared/validateWorthGrading.js";
import {
  isScoreNumber,
  parseScoreString,
} from "../../shared/analysisScores.js";

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

function hasNonEmptyTextItems(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.every(hasText);
}

function isValidCollectorAnalysis(value: unknown) {
  if (!isJsonObject(value) || !Array.isArray(value.categories)) return false;
  const categories = value.categories;
  return (
    hasText(value.variant_name) &&
    parseScoreString(value.totalScore) !== null &&
    hasText(value.verdict) &&
    hasText(value.overview) &&
    hasNonEmptyTextItems(value.finalNote) &&
    categories.length > 0 &&
    categories.every(
      (category) =>
        isJsonObject(category) &&
        hasText(category.name) &&
        parseScoreString(category.score) !== null &&
        hasText(category.text),
    )
  );
}

function isValidMarketSignal(value: unknown) {
  return (
    isJsonObject(value) &&
    isScoreNumber(value.score) &&
    hasText(value.explanation)
  );
}

function isValidMarketOutlook(value: unknown) {
  return (
    isJsonObject(value) && hasText(value.label) && hasText(value.explanation)
  );
}

function isValidMarketLabelExplanation(value: unknown) {
  return (
    isJsonObject(value) && hasText(value.label) && hasText(value.explanation)
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
    isScoreNumber(value.score) &&
    hasNonEmptyTextItems(value.explanation) &&
    hasText(value.headline) &&
    signals &&
    isValidMarketSignal(signals.demand) &&
    isValidMarketSignal(signals.liquidity) &&
    isValidMarketSignal(signals.momentum) &&
    isValidMarketSignal(signals.stability) &&
    isValidMarketLabelExplanation(value.healthiest_segment) &&
    isValidMarketLabelExplanation(value.market_balance) &&
    outlook &&
    isValidMarketOutlook(outlook.near_term) &&
    isValidMarketOutlook(outlook.long_term) &&
    hasOnlyTextItems(outlook.upside_drivers) &&
    hasOnlyTextItems(outlook.risks) &&
    evidenceQuality &&
    isScoreNumber(evidenceQuality.score) &&
    hasText(evidenceQuality.reason),
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
      value.analyses.length > 0 &&
      value.analyses.every(isValidCollectorAnalysis)
    );
  }

  if (storageKey === "market_analysis") {
    return isValidMarketAnalysis(value);
  }

  if (storageKey === "worth_grading") {
    return isValidWorthGradingResponse(value);
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

async function readCard(cardId: string) {
  await ensurePokeTraceReady();
  const result = await pokeTraceDb.execute({
    sql: "SELECT raw_json, saved_responses FROM poketrace_cards WHERE id = ?",
    args: [cardId],
  });
  const row = result.rows[0];
  if (!row) return null;

  const card = parseJsonObject(String(row.raw_json));
  if (!card) {
    throw new Error(`Card ${cardId} contains invalid JSON`);
  }
  return {
    card,
    savedResponses: parsePokeTraceSavedResponses(row.saved_responses),
  };
}

function getFreshFeatureResponse(
  grok: unknown,
  storageKey: string,
  reuseDays: number,
) {
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
  const storedCard = await readCard(cardId);
  if (!storedCard) return null;
  const { card, savedResponses } = storedCard;

  const set = isJsonObject(card.set) ? card.set : null;
  const cardName = typeof card.name === "string" ? card.name.trim() : "";
  const setName = typeof set?.name === "string" ? set.name.trim() : "";
  const rarity = typeof card.rarity === "string" ? card.rarity.trim() : "";
  const rawCardNumber = card.cardNumber;
  const cardNumber =
    typeof rawCardNumber === "string"
      ? rawCardNumber.trim()
      : typeof rawCardNumber === "number" && Number.isFinite(rawCardNumber)
        ? String(rawCardNumber)
        : "";
  const numberParts = cardNumber.split("/");
  const unpaddedNumerator = numberParts[0]?.replace(/^0+(?=\d)/, "") ?? "";
  const unpaddedCardNumber =
    numberParts.length > 1
      ? [unpaddedNumerator, ...numberParts.slice(1)].join("/")
      : unpaddedNumerator;

  return {
    cardName,
    cardNameAndSet: [cardName, setName].filter(Boolean).join(" "),
    cardNumber,
    formattedCardNumber: cardNumber,
    unpaddedCardNumber: unpaddedCardNumber || cardNumber,
    rarity,
    setName,
    storedResponse: getFreshFeatureResponse(
      savedResponses.grok,
      storageKey,
      reuseDays,
    ),
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
  await ensurePokeTraceReady();
  const result = await pokeTraceDb.execute({
    sql: `
      UPDATE poketrace_cards
      SET saved_responses = json_set(saved_responses, ?, json(?))
      WHERE id = ?
    `,
    args: [`$.grok.${storageKey}`, JSON.stringify(storedResponse), cardId],
  });

  if (result.rowsAffected !== 1) {
    throw new Error(`Card ${cardId} was not updated`);
  }

  return storedResponse;
}
