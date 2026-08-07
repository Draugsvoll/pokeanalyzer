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
    unlimited?: PriceData;
    unlimitedHolofoil?: PriceData;
    reverseHolofoil?: PriceData;
    "1stEdition"?: PriceData;
    "1stEditionHolofoil"?: PriceData;
    /** Legacy aliases retained for older cached or imported cards. */
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

export type JustTcgPriceData = {
  absoluteChange24h?: number;
  absoluteChange7d?: number;
  absoluteChange30d?: number;
  cardId?: string;
  cardName?: string;
  condition: string;
  market: number;
  number?: string;
  percentChange24h?: number;
  percentChange7d?: number;
  percentChange30d?: number;
  printing: string;
  setName?: string;
};

export type JustTcg = {
  url?: string;
  updatedAt?: string;
  prices: Record<string, JustTcgPriceData>;
};
