export type TcgPlayerPriceVariant = {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
};

export type TcgPlayerPrices = {
  normal?: TcgPlayerPriceVariant;
  holofoil?: TcgPlayerPriceVariant;
  reverseHolofoil?: TcgPlayerPriceVariant;
  firstEditionHolofoil?: TcgPlayerPriceVariant;
  firstEditionNormal?: TcgPlayerPriceVariant;
};

export type CardmarketPrices = {
  averageSellPrice?: number | null;
  lowPrice?: number | null;
  trendPrice?: number | null;
  germanProLow?: number | null;
  suggestedPrice?: number | null;
  reverseHoloSell?: number | null;
  reverseHoloLow?: number | null;
  reverseHoloTrend?: number | null;
  lowPriceExPlus?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  reverseHoloAvg1?: number | null;
  reverseHoloAvg7?: number | null;
  reverseHoloAvg30?: number | null;
};

export type PokemonTcgApiCard = {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];

  number?: string;
  artist?: string;
  rarity?: string;
  flavorText?: string;
  nationalPokedexNumbers?: number[];

  legalities?: {
    unlimited?: string;
    expanded?: string;
    standard?: string;
  };

  images?: {
    small?: string;
    large?: string;
  };

  set?: {
    id?: string;
    name?: string;
    series?: string;
    printedTotal?: number;
    total?: number;
    legalities?: {
      unlimited?: string;
      expanded?: string;
      standard?: string;
    };
    ptcgoCode?: string;
    releaseDate?: string;
    updatedAt?: string;
    images?: {
      symbol?: string;
      logo?: string;
    };
  };

  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: TcgPlayerPrices;
  };

  cardmarket?: {
    url?: string;
    updatedAt?: string;
    prices?: CardmarketPrices;
  };

  [key: string]: unknown;
};