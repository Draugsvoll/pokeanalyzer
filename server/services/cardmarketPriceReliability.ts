export type CardmarketPriceReliabilitySeverity = "suspicious" | "high_risk";

export type CardmarketPriceReliabilityFlag = {
  code:
    | "trend_far_from_reference"
    | "trend_far_from_consensus"
    | "trend_far_from_previous"
    | "extreme_listing_spread";
  severity: CardmarketPriceReliabilitySeverity;
  message: string;
  ratio: number;
};

export type CardmarketPriceReliability = {
  status: "normal" | CardmarketPriceReliabilitySeverity;
  isFlagged: boolean;
  flags: CardmarketPriceReliabilityFlag[];
};

export const MINIMUM_PRICE_FOR_RELIABILITY_WARNING = 25;

type CardmarketPriceReliabilityInput = {
  trendPrice: number;
  averageSellPrice?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  lowPrice?: number | null;
  previousTrendPrice?: number | null;
};

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundedMetric(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function symmetricRatio(first: number, second: number): number {
  return Math.max(first, second) / Math.min(first, second);
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function assessCardmarketPriceReliability({
  trendPrice,
  averageSellPrice,
  avg7,
  avg30,
  lowPrice,
  previousTrendPrice,
}: CardmarketPriceReliabilityInput): CardmarketPriceReliability {
  if (
    !isPositiveFinite(trendPrice) ||
    trendPrice < MINIMUM_PRICE_FOR_RELIABILITY_WARNING
  ) {
    return { status: "normal", isFlagged: false, flags: [] };
  }

  const flags: CardmarketPriceReliabilityFlag[] = [];
  const references = [averageSellPrice, avg7, avg30].filter(isPositiveFinite);

  if (isPositiveFinite(trendPrice) && references.length === 1) {
    const ratio = symmetricRatio(trendPrice, references[0]);
    if (ratio >= 2) {
      flags.push({
        code: "trend_far_from_reference",
        severity: "suspicious",
        ratio: roundedMetric(ratio),
        message: `Cardmarket trend price is ${roundedMetric(ratio)}× its only recent sales reference.`,
      });
    }
  }

  if (isPositiveFinite(trendPrice) && references.length >= 2) {
    const consensus = median(references);
    const ratio = symmetricRatio(trendPrice, consensus);
    if (ratio >= 2) {
      flags.push({
        code: "trend_far_from_consensus",
        severity: ratio >= 4 ? "high_risk" : "suspicious",
        ratio: roundedMetric(ratio),
        message: `Cardmarket trend price is ${roundedMetric(ratio)}× the recent sales consensus.`,
      });
    }
  }

  if (isPositiveFinite(trendPrice) && isPositiveFinite(previousTrendPrice)) {
    const ratio = symmetricRatio(trendPrice, previousTrendPrice);
    if (ratio >= 3) {
      flags.push({
        code: "trend_far_from_previous",
        severity: ratio >= 10 ? "high_risk" : "suspicious",
        ratio: roundedMetric(ratio),
        message: `Cardmarket trend price changed ${roundedMetric(ratio)}× from its previous stored value.`,
      });
    }
  }

  if (isPositiveFinite(trendPrice) && isPositiveFinite(lowPrice)) {
    const ratio = symmetricRatio(trendPrice, lowPrice);
    if (ratio >= 10) {
      flags.push({
        code: "extreme_listing_spread",
        severity: ratio >= 25 ? "high_risk" : "suspicious",
        ratio: roundedMetric(ratio),
        message: `Cardmarket trend and low listing prices differ by ${roundedMetric(ratio)}×.`,
      });
    }
  }

  const status =
    flags.some((flag) => flag.severity === "high_risk") ||
    flags.filter((flag) => flag.severity === "suspicious").length >= 2
      ? "high_risk"
      : flags.length > 0
        ? "suspicious"
        : "normal";

  return { status, isFlagged: status !== "normal", flags };
}
