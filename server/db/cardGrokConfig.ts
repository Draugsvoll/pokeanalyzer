export const CARD_GROK_FEATURES = {
  collector_analysis: {
    storageKey: "collectors_analysis",
    // Change this number to control how long Samlerverdi is reused.
    reuseDays: 30,
  },
  price_analysis: {
    storageKey: "price_analysis",
    // Change this number to control how long Markedspriser is reused.
    reuseDays: 7,
  },
  ebay_sold: {
    storageKey: "ebay_sold",
    // Change this number to control how long eBay solgte is reused.
    reuseDays: 3,
  },
  worth_grading: {
    storageKey: "worth_grading",
    // Change this number to control how long Worth grading is reused.
    reuseDays: -1,
  },
} as const;

export type CardGrokFeature = keyof typeof CARD_GROK_FEATURES;

export function getCardGrokFeature(feature: string) {
  if (feature in CARD_GROK_FEATURES) {
    return CARD_GROK_FEATURES[feature as CardGrokFeature];
  }
  return null;
}
