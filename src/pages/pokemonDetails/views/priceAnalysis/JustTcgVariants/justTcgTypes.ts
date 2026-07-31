export type JustTcgPricePoint = {
  price: number;
  timestamp: number;
};

export type JustTcgVariant = {
  id: string;
  condition: string;
  printing: string;
  price?: number;
  priceHistory: JustTcgPricePoint[];
  allTimeHigh?: number;
  allTimeHighDate?: string;
  allTimeLow?: number;
  allTimeLowDate?: string;
  updatedAt?: string;
};

export type JustTcgVariantGroup = {
  id: string;
  cardName?: string;
  printing: string;
  setName?: string;
  cardNumber?: string;
  variants: JustTcgVariant[];
  updatedAt?: string;
};
