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

export type BiggestMoversPayload = {
  report_link: string;
  cards: Array<{
    rank: string;
    card_name: string;
    summary: string;
  }>;
};

export type NewsFeedsResponse = {
  generalNews: GeneralNewsPayload | null;
  biggestMovers: BiggestMoversPayload | null;
};
