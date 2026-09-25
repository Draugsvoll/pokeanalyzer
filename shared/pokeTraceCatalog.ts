import type { PokeTraceRawCondition } from "./pokeTraceMarketConditions.js";

export const POKETRACE_CATALOG_SCHEMA_VERSION = 2;

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
  conditionPrices: Partial<Record<PokeTraceRawCondition, number>>;
  priceSnapshots: Record<PokeTraceCatalogPeriod, number | null>;
};

export type PokeTraceCatalogResponse = {
  schemaVersion: typeof POKETRACE_CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  cards: PokeTraceCatalogCard[];
};
