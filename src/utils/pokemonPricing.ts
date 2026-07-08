import type { TCGPlayer } from "../types/pokemon/pricing";

export const TCG_PLAYER_VARIANT_ORDER = [
  "normal",
  "holofoil",
  "reverseHolofoil",
  "firstEditionHolofoil",
  "firstEditionNormal",
] as const;

export type TCGPlayerVariantKey = (typeof TCG_PLAYER_VARIANT_ORDER)[number];

export function getBestTcgPlayerVariant(
  prices?: TCGPlayer["prices"]
): TCGPlayer["prices"][TCGPlayerVariantKey] | undefined {
  if (!prices) return undefined;

  for (const key of TCG_PLAYER_VARIANT_ORDER) {
    const variant = prices[key];
    if (!variant) continue;

    if (
      variant.market != null ||
      variant.low != null ||
      variant.mid != null ||
      variant.high != null ||
      variant.directLow != null
    ) {
      return variant;
    }
  }

  return undefined;
}

export function getBestTcgPlayerVariantName(
  prices?: TCGPlayer["prices"]
): TCGPlayerVariantKey | undefined {
  if (!prices) return undefined;

  for (const key of TCG_PLAYER_VARIANT_ORDER) {
    const variant = prices[key];
    if (!variant) continue;

    if (
      variant.market != null ||
      variant.low != null ||
      variant.mid != null ||
      variant.high != null ||
      variant.directLow != null
    ) {
      return key;
    }
  }

  return undefined;
}

export function getTcgPlayerMarketPrice(prices?: TCGPlayer["prices"]): number | undefined {
  return getBestTcgPlayerVariant(prices)?.market;
}
