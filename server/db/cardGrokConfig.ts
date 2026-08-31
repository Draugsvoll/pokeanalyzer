export const CARD_GROK_FEATURES = {
  collector_analysis: {
    storageKey: "collectors_analysis",
    reuseDays: 90,
  },
  price_analysis: {
    storageKey: "price_analysis",
    reuseDays: 3,
  },
  ebay_sold: {
    storageKey: "ebay_sold",
    reuseDays: 4,
  },
  worth_grading: {
    storageKey: "worth_grading",
    reuseDays: 15,
  },
  sell_price: {
    storageKey: "sell_price",
    reuseDays: 5,
  },
  sales_data: {
    storageKey: "sales_data",
    reuseDays: 5,
  },
} as const;

export type CardGrokFeature = keyof typeof CARD_GROK_FEATURES;

export function getCardGrokFeature(feature: string) {
  if (feature in CARD_GROK_FEATURES) {
    return CARD_GROK_FEATURES[feature as CardGrokFeature];
  }
  return null;
}
