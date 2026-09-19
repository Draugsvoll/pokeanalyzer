export const POKETRACE_CATALOG_SCHEMA_VERSION = 1;

export type PokeTraceCatalogPeriod = "1d" | "7d" | "30d";

export type PokeTraceCatalogCard = {
  id: string;
  name: string;
  number?: string;
  setName: string;
  rarity?: string;
  variant?: string;
  image?: string;
  currency: string;
  marketPrice: number | null;
  priceSnapshots: Record<PokeTraceCatalogPeriod, number | null>;
};

export type PokeTraceCatalogResponse = {
  schemaVersion: typeof POKETRACE_CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  cards: PokeTraceCatalogCard[];
};
