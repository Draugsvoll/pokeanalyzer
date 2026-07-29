export type TcgPriceReliabilitySeverity = "suspicious" | "high_risk";

export type TcgPriceReliabilityFlag = {
  code:
    | "invalid_listing_order"
    | "market_below_listing_range"
    | "market_above_listing_range"
    | "market_far_from_mid"
    | "extreme_listing_spread";
  severity: TcgPriceReliabilitySeverity;
  message: string;
  differencePercent?: number;
  ratio?: number;
};

export type TcgPriceReliability = {
  status: "normal" | TcgPriceReliabilitySeverity;
  flags: TcgPriceReliabilityFlag[];
};

function roundedMetric(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function assessTcgPriceReliability({
  high,
  low,
  market,
  mid,
}: {
  high: number | null;
  low: number | null;
  market: number;
  mid: number | null;
}): TcgPriceReliability {
  const flags: TcgPriceReliabilityFlag[] = [];

  if (
    (low !== null && mid !== null && low > mid) ||
    (mid !== null && high !== null && mid > high) ||
    (low !== null && high !== null && low > high)
  ) {
    flags.push({
      code: "invalid_listing_order",
      severity: "high_risk",
      message: "TCGPlayer listing prices are not ordered low ≤ mid ≤ high.",
    });
  }

  if (low !== null && market < low) {
    const differencePercent = ((low - market) / low) * 100;
    if (differencePercent >= 10) {
      flags.push({
        code: "market_below_listing_range",
        severity: differencePercent >= 50 ? "high_risk" : "suspicious",
        differencePercent: roundedMetric(differencePercent),
        message: `Market price is ${roundedMetric(differencePercent)}% below the current low listing.`,
      });
    }
  }

  if (high !== null && market > high) {
    const differencePercent = ((market - high) / high) * 100;
    if (differencePercent >= 10) {
      flags.push({
        code: "market_above_listing_range",
        severity: differencePercent >= 100 ? "high_risk" : "suspicious",
        differencePercent: roundedMetric(differencePercent),
        message: `Market price is ${roundedMetric(differencePercent)}% above the current high listing.`,
      });
    }
  }

  if (mid !== null) {
    const ratio = market / mid;
    if (ratio >= 2 || ratio <= 0.5) {
      flags.push({
        code: "market_far_from_mid",
        severity: ratio >= 4 || ratio <= 0.25 ? "high_risk" : "suspicious",
        ratio: roundedMetric(ratio),
        message: `Market price is ${roundedMetric(ratio)}× the current mid listing.`,
      });
    }
  }

  if (low !== null && high !== null) {
    const ratio = high / low;
    if (ratio >= 10) {
      flags.push({
        code: "extreme_listing_spread",
        severity: ratio >= 25 ? "high_risk" : "suspicious",
        ratio: roundedMetric(ratio),
        message: `The high listing is ${roundedMetric(ratio)}× the low listing.`,
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

  return { status, flags };
}
