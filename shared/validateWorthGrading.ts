import { parseScoreString } from "./analysisScores.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isString(value: unknown) {
  return typeof value === "string";
}

function isNullableString(value: unknown) {
  return value === null || isString(value);
}

function isNullableNumber(value: unknown) {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function isGradedScenario(value: unknown) {
  return (
    isObject(value) &&
    hasText(value.grade) &&
    isNullableNumber(value.expected_sale_price_usd) &&
    isNullableString(value.grading_tier) &&
    isNullableString(value.grading_tier_justification) &&
    isNullableNumber(value.psa_grading_fee_usd) &&
    isNullableNumber(value.shipping_and_insurance_usd) &&
    isNullableNumber(value.ebay_fees_usd) &&
    isNullableString(value.ebay_fee_model) &&
    isNullableNumber(value.roi_vs_raw_net_percent) &&
    isNullableNumber(value.net_profit_vs_raw_usd) &&
    isNullableString(value.turnaround_time) &&
    isNullableString(value.psa_note)
  );
}

function isVariant(value: unknown) {
  if (!isObject(value)) return false;

  const card = value.card;
  const attractiveness = value.attractiveness_level;
  const rawSale = value.raw_sale_today;
  const riskProfile = value.risk_profile;
  const scenarios = value.graded_scenarios;

  return (
    isObject(card) &&
    isString(card.name) &&
    isString(card.set) &&
    isString(card.number) &&
    hasText(card.variant_name) &&
    isObject(attractiveness) &&
    parseScoreString(attractiveness.score) !== null &&
    Array.isArray(attractiveness.reasoning) &&
    attractiveness.reasoning.length > 0 &&
    attractiveness.reasoning.every(hasText) &&
    isObject(rawSale) &&
    isNullableNumber(rawSale.gross_sale_usd) &&
    isNullableNumber(rawSale.estimated_fees_usd) &&
    isNullableNumber(rawSale.net_proceeds_usd) &&
    isNullableString(rawSale.time_to_sell) &&
    Array.isArray(scenarios) &&
    scenarios.length > 0 &&
    scenarios.every(isGradedScenario) &&
    hasText(value.potential) &&
    hasText(value.headline) &&
    hasText(value.bottom_line) &&
    isObject(riskProfile) &&
    hasText(riskProfile.label) &&
    hasText(riskProfile.explanation)
  );
}

export function isValidWorthGradingResponse(value: unknown) {
  return (
    isObject(value) &&
    Array.isArray(value.variants) &&
    value.variants.length > 0 &&
    value.variants.every(isVariant)
  );
}
