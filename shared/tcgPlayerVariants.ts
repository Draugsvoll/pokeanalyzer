export const TCG_PLAYER_VARIANT_ORDER = [
  "normal",
  "holofoil",
  "unlimited",
  "unlimitedHolofoil",
  "reverseHolofoil",
  "1stEdition",
  "1stEditionHolofoil",
  // Legacy aliases retained for older cached or imported cards.
  "firstEditionNormal",
  "firstEditionHolofoil",
] as const;

export type TcgPlayerVariantKey = (typeof TCG_PLAYER_VARIANT_ORDER)[number];

/**
 * Base printings are ordered before special printings. Unknown future keys
 * remain usable, but are sorted so the default never depends on JSON order.
 */
export function getOrderedTcgPlayerVariantKeys(
  prices: Record<string, unknown>,
): string[] {
  const knownKeys = new Set<string>(TCG_PLAYER_VARIANT_ORDER);
  const unknownKeys = Object.keys(prices)
    .filter((key) => !knownKeys.has(key))
    .sort((first, second) => first.localeCompare(second));

  return [...TCG_PLAYER_VARIANT_ORDER, ...unknownKeys];
}
