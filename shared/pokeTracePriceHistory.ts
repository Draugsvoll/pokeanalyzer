export type CardPriceHistorySnapshot = {
  recordedAt: string;
  currency: string | null;
  prices: Record<string, unknown>;
  sourceUpdatedAt: string | null;
};

export type CardPriceHistoryResponse = {
  cardId: string;
  days: number;
  /** Daily snapshots ordered oldest to newest. Missing dates are not synthesized. */
  snapshots: CardPriceHistorySnapshot[];
};
