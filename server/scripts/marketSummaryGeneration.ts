import type { MarketSummaryPayload } from "../../src/types/news.js";
import { parseMarketSummaryResponse } from "../../src/utils/marketSummaryPayload.js";
import type { GrokChatOptions } from "../services/xaiService.js";

export type { MarketSummaryPayload };
export { parseMarketSummaryResponse };

export const MARKET_SUMMARY_REFRESH_INTERVAL_MS = 13 * 24 * 60 * 60 * 1_000;

export const MARKET_SUMMARY_GROK_OPTIONS = {
  model: "grok-4.7",
  reasoningEffort: "xhigh",
  useCodeInterpreter: false,
} satisfies Pick<
  GrokChatOptions,
  "model" | "reasoningEffort" | "useCodeInterpreter"
>;

export function isMarketSummaryFresh(
  generatedAt: string,
  now = Date.now(),
): boolean {
  const generatedAtMs = Date.parse(generatedAt);
  return (
    Number.isFinite(generatedAtMs) &&
    now - generatedAtMs < MARKET_SUMMARY_REFRESH_INTERVAL_MS
  );
}
