export const CARD_GROK_FEATURES = {
  collector_analysis: {
    storageKey: "collectors_analysis",
    // Change this number to control how long Samlerverdi is reused.
    reuseDays: 5,
  },
  price_analysis: {
    storageKey: "price_analysis",
    // Change this number to control how long Markedspriser is reused.
    reuseDays: 5,
  },
  ebay_sold: {
    storageKey: "ebay_sold",
    // Change this number to control how long eBay solgte is reused.
    reuseDays: 5,
  },
  worth_grading: {
    storageKey: "worth_grading",
    // Change this number to control how long Worth grading is reused.
    reuseDays: -1,
  },
  sell_price: {
    storageKey: "sell_price",
    // Change this number to control how long selling recommendations are reused.
    reuseDays: 5,
  },
  sales_data: {
    storageKey: "sales_data",
    // Change this number to control how long sales data is reused.
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
