import type { MarketSummaryPayload } from "../../src/types/news.js";
import { hasRenderableMarketSummaryContent } from "../../src/utils/marketSummaryPayload.js";
import type { GrokChatOptions } from "../services/xaiService.js";

type JsonRecord = Record<string, unknown>;

export type { MarketSummaryPayload };

export const MARKET_SUMMARY_GROK_OPTIONS = {
  model: "grok-4.5",
  reasoningEffort: "high",
  useCodeInterpreter: false,
} satisfies Pick<
  GrokChatOptions,
  "model" | "reasoningEffort" | "useCodeInterpreter"
>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(optionalString).filter(Boolean);
}

function recordList(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
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

  if (!isRecord(payload)) {
    throw new Error("market summary response must be a JSON object");
  }

  const marketTone = optionalRecord(payload.market_tone ?? payload.marketTone);
  const collectorOutlook = optionalRecord(
    payload.collector_outlook ?? payload.collectorOutlook,
  );

  const result: MarketSummaryPayload = {
    generatedAt: generatedAt ?? optionalString(payload.generatedAt),
    marketTone: marketTone
      ? {
          label: optionalString(marketTone.label),
          headline: optionalString(marketTone.headline),
        }
      : null,
    marketOverview: stringList(
      payload.market_overview ?? payload.marketOverview,
    ),
    keyThemesAndChanges: recordList(
      payload.key_themes_and_changes ?? payload.keyThemesAndChanges,
    )
      .map((item) => ({
        title: optionalString(item.title),
        label: optionalString(item.label),
        theme: optionalString(item.theme),
      }))
      .filter((item) => item.title || item.label || item.theme),
    liquidity: recordList(payload.liquidity)
      .map((item) => ({
        label: optionalString(item.label),
        title: optionalString(item.title),
        description: optionalString(item.description),
      }))
      .filter((item) => item.label || item.title || item.description),
    marketDrivers: recordList(payload.market_drivers ?? payload.marketDrivers)
      .map((item) => ({
        title: optionalString(item.title),
        description: optionalString(item.description),
      }))
      .filter((item) => item.title || item.description),
    segmentSummary: recordList(
      payload.segment_summary ?? payload.segmentSummary,
    )
      .map((item) => ({
        title: optionalString(item.title),
        trend: optionalString(item.trend),
        description: optionalString(item.description),
      }))
      .filter((item) => item.title || item.trend || item.description),
    collectorOutlook: collectorOutlook
      ? {
          label: optionalString(collectorOutlook.label),
          outlook: optionalString(collectorOutlook.outlook),
        }
      : null,
    whatToWatch: recordList(payload.what_to_watch ?? payload.whatToWatch)
      .map((item) => ({
        title: optionalString(item.title),
        description: optionalString(item.description),
      }))
      .filter((item) => item.title || item.description),
  };

  if (!hasRenderableMarketSummaryContent(result)) {
    throw new Error("market summary response did not contain any content");
  }

  return result;
}
