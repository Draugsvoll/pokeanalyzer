export type PokeTraceMarketComparisonPeriod = "1d" | "7d" | "30d";

export type PokeTraceMarketComparisonSnapshot = {
  targetDate: string;
  recordedAt: string;
  marketPrice: number;
  sourceUpdatedAt: string | null;
};

export type PokeTraceMarketComparisons = {
  asOf: string;
  comparisons: Record<
    PokeTraceMarketComparisonPeriod,
    PokeTraceMarketComparisonSnapshot | null
  >;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS = ["1d", "7d", "30d"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSnapshot(
  value: unknown,
): PokeTraceMarketComparisonSnapshot | null | undefined {
  if (value === null) return null;
  const raw = record(value);
  if (!raw) return undefined;
  const marketPrice = Number(raw.marketPrice);
  if (
    typeof raw.targetDate !== "string" ||
    !DATE_PATTERN.test(raw.targetDate) ||
    typeof raw.recordedAt !== "string" ||
    !DATE_PATTERN.test(raw.recordedAt) ||
    !Number.isFinite(marketPrice) ||
    marketPrice <= 0
  ) {
    return undefined;
  }
  return {
    targetDate: raw.targetDate,
    recordedAt: raw.recordedAt,
    marketPrice,
    sourceUpdatedAt:
      typeof raw.sourceUpdatedAt === "string" ? raw.sourceUpdatedAt : null,
  };
}

export function parsePokeTraceMarketComparisons(
  value: unknown,
): PokeTraceMarketComparisons | undefined {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }
  const raw = record(parsed);
  const comparisons = record(raw?.comparisons);
  if (
    typeof raw?.asOf !== "string" ||
    !DATE_PATTERN.test(raw.asOf) ||
    !comparisons
  ) {
    return undefined;
  }

  const result = {} as PokeTraceMarketComparisons["comparisons"];
  for (const period of PERIODS) {
    const snapshot = parseSnapshot(comparisons[period]);
    if (snapshot === undefined) return undefined;
    result[period] = snapshot;
  }
  return { asOf: raw.asOf, comparisons: result };
}
