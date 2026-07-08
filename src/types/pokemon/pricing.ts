export type PriceData = {
  low: number;
  mid: number;
  high: number;
  market: number;
  directLow: number | null;
};

export type TCGPlayer = {
  url: string;
  updatedAt: string;
  prices: {
    normal?: PriceData;
    holofoil?: PriceData;
    reverseHolofoil?: PriceData;
    firstEditionHolofoil?: PriceData;
    firstEditionNormal?: PriceData;
  };
};

export type CardMarket = {
  url: string;
  updatedAt: string;
  prices: {
    averageSellPrice: number;
    lowPrice: number;
    trendPrice: number;
    germanProLow: number;
    suggestedPrice: number;

    reverseHoloSell?: number;
    reverseHoloLow?: number;
    reverseHoloTrend?: number;

    lowPriceExPlus?: number;

    avg1?: number;
    avg7?: number;
    avg30?: number;

    reverseHoloAvg1?: number;
    reverseHoloAvg7?: number;
    reverseHoloAvg30?: number;
  };
};