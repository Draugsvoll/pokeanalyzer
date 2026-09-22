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

export type NewsFeedsResponse = {
  generalNews: GeneralNewsPayload | null;
};
