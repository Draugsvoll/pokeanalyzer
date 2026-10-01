import type { MarketSummaryPayload } from "../types/news";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasStringFields(
  value: unknown,
  fields: readonly string[],
): value is JsonRecord {
  return (
    isRecord(value) && fields.every((field) => typeof value[field] === "string")
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isRecordArray(value: unknown, fields: readonly string[]): boolean {
  return (
    Array.isArray(value) && value.every((item) => hasStringFields(item, fields))
  );
}

export function hasRenderableMarketSummaryContent(
  payload: MarketSummaryPayload,
): boolean {
  return Boolean(
    payload.marketTone?.headline ||
    payload.marketTone?.label ||
    payload.collectorOutlook?.outlook ||
    payload.collectorOutlook?.label ||
    payload.keyThemesAndChanges.some((item) => item.title || item.theme) ||
    payload.liquidity.some(
      (item) => item.title || item.label || item.description,
    ) ||
    payload.marketDrivers.some((item) => item.title || item.description) ||
    payload.segmentSummary.some(
      (item) => item.title || item.trend || item.description,
    ) ||
    payload.whatToWatch.some((item) => item.title || item.description),
  );
}

export function isMarketSummaryPayload(
  value: unknown,
): value is MarketSummaryPayload {
  if (!isRecord(value) || typeof value.generatedAt !== "string") return false;

  const validMarketTone =
    value.marketTone === null ||
    hasStringFields(value.marketTone, ["label", "headline"]);
  const validCollectorOutlook =
    value.collectorOutlook === null ||
    hasStringFields(value.collectorOutlook, ["label", "outlook"]);

  if (!validMarketTone || !validCollectorOutlook) return false;
  if (!isStringArray(value.marketOverview)) return false;
  if (
    !isRecordArray(value.keyThemesAndChanges, ["title", "label", "theme"]) ||
    !isRecordArray(value.liquidity, ["label", "title", "description"]) ||
    !isRecordArray(value.marketDrivers, ["title", "description"]) ||
    !isRecordArray(value.segmentSummary, ["title", "trend", "description"]) ||
    !isRecordArray(value.whatToWatch, ["title", "description"])
  ) {
    return false;
  }

  return hasRenderableMarketSummaryContent(value as MarketSummaryPayload);
}
