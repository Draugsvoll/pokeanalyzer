import {
  POKETRACE_RAW_CONDITIONS,
  POKETRACE_RAW_CONDITION_LABELS,
} from "./pokeTraceMarketConditions.js";
import type { PokeTraceMarket } from "./pokeTraceMarkets.js";
import { MINIMUM_GRADED_PRICE_SALES } from "./gradedPrice.js";

type Grader = "PSA" | "BGS" | "CGC" | "SGC" | "ACE" | "TAG";
export type GradedHistoryTier = `${Grader}_${string}`;
export const RAW_HISTORY_TIERS = ["MINT", ...POKETRACE_RAW_CONDITIONS] as const;
type RawHistoryTier = (typeof RAW_HISTORY_TIERS)[number];
export type MarketHistoryTier = RawHistoryTier | GradedHistoryTier;
const RAW_HISTORY_LABELS = { MINT: "Mint", ...POKETRACE_RAW_CONDITION_LABELS };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isGradedHistoryTier(
  value: unknown,
): value is GradedHistoryTier {
  return (
    typeof value === "string" &&
    /^(PSA|BGS|CGC|SGC|ACE|TAG)_(0_5|[1-9](?:_5)?|10)$/.test(value)
  );
}

export function isMarketHistoryTier(
  value: unknown,
): value is MarketHistoryTier {
  return (
    typeof value === "string" &&
    ((RAW_HISTORY_TIERS as readonly string[]).includes(value) ||
      isWholeGradedHistoryTier(value))
  );
}

function isWholeGradedHistoryTier(value: unknown): value is GradedHistoryTier {
  return isGradedHistoryTier(value) && value.split("_").length === 2;
}

export function marketHistoryTierLabel(tier: MarketHistoryTier) {
  return isGradedHistoryTier(tier)
    ? tier.replace("_", " ").replaceAll("_", ".")
    : RAW_HISTORY_LABELS[tier];
}

export function qualifyingGradedHistoryTiers(
  prices: unknown,
  gradedOptions?: unknown,
  now = Date.now(),
  market: PokeTraceMarket = "US",
): GradedHistoryTier[] {
  const tiers = record(prices);
  if (!tiers) return [];
  const source = market === "EU" ? "cardmarket_unsold" : "ebay";
  const entries = new Map(
    Object.entries(tiers).map(
      ([tier, markets]) =>
        [tier, record(record(markets)?.[market])?.[source]] as const,
    ),
  );
  const today = new Date(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() - 2;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const oldestUpdate = Date.UTC(
    year,
    month,
    Math.min(today.getUTCDate(), lastDay),
  );
  const available = Array.isArray(gradedOptions)
    ? new Set(gradedOptions.filter(isGradedHistoryTier))
    : null;
  return [...entries.keys()]
    .filter(isWholeGradedHistoryTier)
    .filter((tier) => {
      if (available && !available.has(tier)) return false;
      const price = record(entries.get(tier));
      const updatedAt =
        typeof price?.lastUpdated === "string"
          ? Date.parse(price.lastUpdated)
          : NaN;
      return (
        updatedAt >= oldestUpdate &&
        updatedAt <= now &&
        typeof price?.saleCount === "number" &&
        Number.isFinite(price.saleCount) &&
        price.saleCount >= MINIMUM_GRADED_PRICE_SALES &&
        [price.median30d, price.avg].some(
          (value) =>
            typeof value === "number" && Number.isFinite(value) && value > 0,
        )
      );
    })
    .sort((left, right) =>
      left.localeCompare(right, "en-US", { numeric: true }),
    );
}
