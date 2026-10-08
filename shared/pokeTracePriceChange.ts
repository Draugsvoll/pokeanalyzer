export const MINIMUM_GAINER_LOSER_PRICE = 2;

export function normalizeDisplayedPriceChangePercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.abs(value) < 0.05 ? 0 : value;
}

export function calculateDisplayedPriceChangePercent(
  currentPrice: number | null | undefined,
  comparisonPrice: number | null | undefined,
) {
  if (
    currentPrice == null ||
    comparisonPrice == null ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(comparisonPrice) ||
    comparisonPrice <= 0
  ) {
    return null;
  }

  return normalizeDisplayedPriceChangePercent(
    ((currentPrice - comparisonPrice) / comparisonPrice) * 100,
  );
}
