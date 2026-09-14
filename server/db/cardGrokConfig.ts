export const CARD_GROK_FEATURES = {
  collector_analysis: {
    storageKey: "collectors_analysis",
    reuseDays: 90,
  },
  market_analysis: {
    storageKey: "market_analysis",
    reuseDays: 8,
  },
  ebay_sold: {
    storageKey: "ebay_sold",
    reuseDays: 4,
  },
  worth_grading: {
    storageKey: "worth_grading",
    reuseDays: 15,
  },
} as const;

export type CardGrokFeature = keyof typeof CARD_GROK_FEATURES;

export function getCardGrokFeature(feature: string) {
  if (feature in CARD_GROK_FEATURES) {
    return CARD_GROK_FEATURES[feature as CardGrokFeature];
  }
  return null;
}
