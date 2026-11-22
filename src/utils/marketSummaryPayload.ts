import { isScoreNumber } from "../../shared/analysisScores";
import {
  MARKET_SEGMENT_KEYS,
  type MarketSegmentKey,
  type MarketSummaryPayload,
} from "../types/news";

type JsonRecord = Record<string, unknown>;

export const MARKET_SEGMENT_TITLES: Record<MarketSegmentKey, string> = {
  vintage: "Vintage",
  modern: "Modern",
  graded: "Graded",
  sealed: "Sealed",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMarketSegmentKey(value: unknown): value is MarketSegmentKey {
  return (
    typeof value === "string" &&
    (MARKET_SEGMENT_KEYS as readonly string[]).includes(value)
  );
}

function parseStringList(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const item of value) {
    if (item == null) continue;
    if (typeof item !== "string") return null;
    const text = item.trim();
    if (text) items.push(text);
  }
  return items;
}

function parseRecordList(value: unknown): JsonRecord[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const items: JsonRecord[] = [];
  for (const item of value) {
    if (item == null) continue;
    if (!isRecord(item)) return null;
    items.push(item);
  }
  return items;
}

function parseLabeledText(
  value: unknown,
  textKey: "headline" | "outlook",
): { label: string; text: string } | null | undefined {
  if (value == null) return null;
  if (!isRecord(value)) return undefined;
  const label = optionalString(value.label);
  const text = optionalString(value[textKey]);
  if (!label && !text) return null;
  return { label, text };
}

function parseSegmentEntry(
  key: MarketSegmentKey,
  value: unknown,
): MarketSummaryPayload["segmentSummary"][number] | null | undefined {
  if (value == null) return null;
  if (!isRecord(value)) return undefined;
  const trend = optionalString(value.trend);
  const description = optionalString(value.description);
  if (!trend && !description) return null;
  return {
    key,
    title: MARKET_SEGMENT_TITLES[key],
    trend,
    description,
  };
}

function parseSegmentSummary(
  value: unknown,
): MarketSummaryPayload["segmentSummary"] | null {
  const records = parseRecordList(value);
  if (!records) return null;

  const segments: MarketSummaryPayload["segmentSummary"] = [];
  const seen = new Set<MarketSegmentKey>();

  for (const item of records) {
    const namedKeys = MARKET_SEGMENT_KEYS.filter((key) => key in item);
    if (namedKeys.length > 0) {
      for (const key of namedKeys) {
        const parsed = parseSegmentEntry(key, item[key]);
        if (parsed === undefined) return null;
        if (!parsed || seen.has(key)) continue;
        seen.add(key);
        segments.push(parsed);
      }
      continue;
    }

    if (
      isMarketSegmentKey(item.key) &&
      typeof item.title === "string" &&
      typeof item.trend === "string" &&
      typeof item.description === "string"
    ) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      segments.push({
        key: item.key,
        title: item.title,
        trend: item.trend,
        description: item.description,
      });
      continue;
    }

    return null;
  }

  return segments;
}

export function hasRenderableMarketSummaryContent(
  payload: MarketSummaryPayload,
): boolean {
  return Boolean(
    payload.marketScore != null ||
    payload.marketTone?.headline ||
    payload.marketTone?.label ||
    payload.collectorOutlook?.outlook ||
    payload.collectorOutlook?.label ||
    payload.keyThemesAndChanges.some((item) => item.title || item.theme) ||
    payload.marketDrivers.some((item) => item.title || item.description) ||
    payload.segmentSummary.some((item) => item.trend || item.description) ||
    payload.whatToWatch.some((item) => item.title || item.description),
  );
}

export function parseMarketSummaryPayload(
  value: unknown,
  generatedAt?: string,
): MarketSummaryPayload | null {
  if (!isRecord(value)) return null;

  const rawExplanation =
    value.market_score_explanation ?? value.marketScoreExplanation;
  if (rawExplanation === undefined) return null;
  const marketScoreExplanation = parseStringList(rawExplanation);
  if (!marketScoreExplanation) return null;

  const keyThemesAndChanges = parseRecordList(
    value.key_themes_and_changes ?? value.keyThemesAndChanges,
  );
  const marketDrivers = parseRecordList(
    value.market_drivers ?? value.marketDrivers,
  );
  const whatToWatch = parseRecordList(value.what_to_watch ?? value.whatToWatch);
  const segmentSummary = parseSegmentSummary(
    value.segment_summary ?? value.segmentSummary,
  );

  if (
    !keyThemesAndChanges ||
    !marketDrivers ||
    !whatToWatch ||
    !segmentSummary
  ) {
    return null;
  }

  const marketTone = parseLabeledText(
    value.market_tone ?? value.marketTone,
    "headline",
  );
  const collectorOutlook = parseLabeledText(
    value.collector_outlook ?? value.collectorOutlook,
    "outlook",
  );
  if (marketTone === undefined || collectorOutlook === undefined) return null;

  const rawMarketScore = value.market_score ?? value.marketScore;
  const payload: MarketSummaryPayload = {
    generatedAt: generatedAt ?? optionalString(value.generatedAt),
    marketScore: isScoreNumber(rawMarketScore) ? rawMarketScore : null,
    marketScoreExplanation,
    marketTone: marketTone
      ? { label: marketTone.label, headline: marketTone.text }
      : null,
    keyThemesAndChanges: keyThemesAndChanges
      .map((item) => ({
        title: optionalString(item.title),
        label: optionalString(item.label),
        theme: optionalString(item.theme),
      }))
      .filter((item) => item.title || item.label || item.theme),
    marketDrivers: marketDrivers
      .map((item) => ({
        title: optionalString(item.title),
        description: optionalString(item.description),
      }))
      .filter((item) => item.title || item.description),
    segmentSummary,
    collectorOutlook: collectorOutlook
      ? { label: collectorOutlook.label, outlook: collectorOutlook.text }
      : null,
    whatToWatch: whatToWatch
      .map((item) => ({
        title: optionalString(item.title),
        description: optionalString(item.description),
      }))
      .filter((item) => item.title || item.description),
  };

  return hasRenderableMarketSummaryContent(payload) ? payload : null;
}

export function isMarketSummaryPayload(
  value: unknown,
): value is MarketSummaryPayload {
  if (!isRecord(value) || typeof value.generatedAt !== "string") return false;
  if (!("marketScore" in value)) return false;
  if (value.marketScore !== null && !isScoreNumber(value.marketScore)) {
    return false;
  }
  if (
    hasNullEntries(value.marketScoreExplanation) ||
    hasNullEntries(value.keyThemesAndChanges) ||
    hasNullEntries(value.marketDrivers) ||
    hasNullEntries(value.segmentSummary) ||
    hasNullEntries(value.whatToWatch)
  ) {
    return false;
  }
  return parseMarketSummaryPayload(value) !== null;
}

function hasNullEntries(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => item == null);
}

export function parseMarketSummaryResponse(
  responseText: string,
  generatedAt?: string,
): MarketSummaryPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(responseText) as unknown;
  } catch {
    throw new Error("market summary response contained invalid JSON");
  }

  const parsed = parseMarketSummaryPayload(payload, generatedAt);
  if (!parsed) {
    throw new Error("market summary response did not match the current schema");
  }

  return parsed;
}
