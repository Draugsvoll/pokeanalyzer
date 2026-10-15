import type { PokeTraceSealedCatalogProduct } from "../../shared/pokeTraceSealed.js";

function dateOffset(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function sealedPriceComparisons(
  snapshots: Map<string, number>,
): PokeTraceSealedCatalogProduct["priceSnapshots"] {
  // Anchor every period to this product's latest snapshot, not the viewing date.
  let asOf = "";
  for (const date of snapshots.keys()) {
    if (date > asOf) asOf = date;
  }

  const comparisonPrice = (days: number) => {
    if (!asOf) return null;
    const target = dateOffset(asOf, -days);
    return (
      snapshots.get(target) ??
      snapshots.get(dateOffset(target, -1)) ??
      snapshots.get(dateOffset(target, 1)) ??
      null
    );
  };

  return {
    "1d": comparisonPrice(1),
    "7d": comparisonPrice(7),
    "30d": comparisonPrice(30),
  };
}
