export type GeneralNewsPayload = {
  date: string;
  items: Array<{
    headline: string;
    label: string;
    summary: string;
    action: string[];
    url: string;
  }>;
};

export type MarketSummaryPayload = {
  generatedAt: string;
  marketTone: {
    label: string;
    headline: string;
  } | null;
  marketOverview: string[];
  keyThemesAndChanges: Array<{
    title: string;
    label: string;
    theme: string;
  }>;
  liquidity: Array<{
    label: string;
    title: string;
    description: string;
  }>;
  marketDrivers: Array<{
    title: string;
    description: string;
  }>;
  segmentSummary: Array<{
    title: string;
    trend: string;
    description: string;
  }>;
  collectorOutlook: {
    label: string;
    outlook: string;
  } | null;
  whatToWatch: Array<{
    title: string;
    description: string;
  }>;
};

export type NewsFeedsResponse = {
  generalNews: GeneralNewsPayload | null;
};

export type MarketSummaryResponse = {
  marketSummary: MarketSummaryPayload | null;
};
