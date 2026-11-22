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

export const MARKET_SEGMENT_KEYS = [
  "vintage",
  "modern",
  "graded",
  "sealed",
] as const;

export type MarketSegmentKey = (typeof MARKET_SEGMENT_KEYS)[number];

export type MarketSummaryPayload = {
  generatedAt: string;
  marketScore: number | null;
  marketScoreExplanation: string[];
  marketTone: {
    label: string;
    headline: string;
  } | null;
  keyThemesAndChanges: Array<{
    title: string;
    label: string;
    theme: string;
  }>;
  marketDrivers: Array<{
    title: string;
    description: string;
  }>;
  segmentSummary: Array<{
    key: MarketSegmentKey;
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
