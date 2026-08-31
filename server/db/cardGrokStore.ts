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

function isScore(value: unknown) {
  const score =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(score) && score >= 1 && score <= 100;
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

function isDisplayableMarketData(value: unknown) {
  if (!isJsonObject(value)) return false;

  return hasMeaningfulField(value, [
    "source",
    "region",
    "notes",
    "url",
    "market_price",
    "lowest_listing",
    "most_recent_sale",
    "near_mint_listing",
    "excellent_listing",
    "lowest_playable_listing",
    "recent_near_mint_sales",
  ]);
}

function isDisplayableSalesVariant(value: unknown) {
  if (!isJsonObject(value) || !hasText(value.variant)) return false;

  return (
    Array.isArray(value.market_prices) &&
    value.market_prices.some(
      (price) =>
        isJsonObject(price) &&
        hasMeaningfulField(price, ["grade", "price", "volume"]),
    )
  );
}

function isDisplayableSellVariant(value: unknown) {
  if (!isJsonObject(value) || !hasText(value.variant)) return false;

  const hasStep =
    Array.isArray(value.steps) &&
    value.steps.some(
      (step) =>
        isJsonObject(step) &&
        ["substeps", "actions", "details", "recommendations"].some(
          (field) =>
            Array.isArray(step[field]) && step[field].some(hasMeaningfulValue),
        ),
    );
  const hasNotes =
    Array.isArray(value.notes) && value.notes.some(hasMeaningfulValue);

  return hasStep || hasNotes;
}

function isDisplayableWorthGradingScenario(value: unknown) {
  return (
    isJsonObject(value) &&
    hasText(value.grade) &&
    hasMeaningfulField(value, [
      "expected_sale_price_usd",
      "net_profit_vs_raw_usd",
      "roi_vs_raw_net_percent",
    ])
  );
}

function isDisplayableWorthGradingVariant(value: unknown) {
  if (
    !isJsonObject(value) ||
    !isJsonObject(value.card) ||
    !Array.isArray(value.graded_scenarios) ||
    !isJsonObject(value.attractiveness_level) ||
    !isJsonObject(value.recommendation)
  ) {
    return false;
  }

  const hasScenario = value.graded_scenarios.some(
    isDisplayableWorthGradingScenario,
  );
  const hasRecommendation =
    hasMeaningfulField(value.recommendation, ["potential"]) &&
    hasMeaningfulField(value.recommendation, ["headline"]) &&
    hasMeaningfulField(value.recommendation, ["bottom_line"]);
  const hasAttractivenessReasoning = hasText(
    value.attractiveness_level.reasoning,
  );
  const hasAttractivenessScore = isScore(value.attractiveness_level.score);

  return (
    hasScenario &&
    hasRecommendation &&
    hasAttractivenessReasoning &&
    hasAttractivenessScore
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

  if (storageKey === "price_analysis") {
    return (
      Array.isArray(value.market_data) &&
      value.market_data.some(isDisplayableMarketData)
    );
  }

  if (storageKey === "sales_data") {
    return (
      Array.isArray(value.variants) &&
      value.variants.some(isDisplayableSalesVariant)
    );
  }

  if (storageKey === "sell_price") {
    return (
      Array.isArray(value.variants) &&
      value.variants.some(isDisplayableSellVariant)
    );
  }

  if (storageKey === "worth_grading") {
    return (
      Array.isArray(value.variants) &&
      value.variants.some(isDisplayableWorthGradingVariant)
    );
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
  if (!isValidStoredFeatureResponse(storageKey, response)) return null;

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
