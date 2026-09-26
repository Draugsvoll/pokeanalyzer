import {
  isPokeTraceRawCondition,
  type PokeTraceRawCondition,
} from "./pokeTraceMarketConditions.js";

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

function isNullablePrice(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isConditionPrices(
  value: unknown,
): value is PokeTraceCatalogCard["conditionPrices"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([condition, price]) =>
      isPokeTraceRawCondition(condition) &&
      typeof price === "number" &&
      Number.isFinite(price) &&
      price > 0,
  );
}

export function isPokeTraceCatalogCard(
  value: unknown,
): value is PokeTraceCatalogCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Partial<PokeTraceCatalogCard>;
  const snapshots = card.priceSnapshots;
  return Boolean(
    typeof card.id === "string" &&
    card.id.trim() &&
    typeof card.name === "string" &&
    card.name.trim() &&
    typeof card.setName === "string" &&
    card.setName.trim() &&
    typeof card.currency === "string" &&
    card.currency.trim() &&
    isOptionalText(card.number) &&
    isOptionalText(card.rarity) &&
    isOptionalText(card.variant) &&
    isOptionalText(card.image) &&
    isConditionPrices(card.conditionPrices) &&
    snapshots &&
    typeof snapshots === "object" &&
    !Array.isArray(snapshots) &&
    isNullablePrice(snapshots["1d"]) &&
    isNullablePrice(snapshots["7d"]) &&
    isNullablePrice(snapshots["30d"]),
  );
}

export function parsePokeTraceCatalogResponse(
  value: unknown,
): PokeTraceCatalogResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid PokeTrace catalog response");
  }
  const response = value as Partial<PokeTraceCatalogResponse>;
  if (
    response.schemaVersion !== POKETRACE_CATALOG_SCHEMA_VERSION ||
    typeof response.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(response.generatedAt)) ||
    !Array.isArray(response.cards) ||
    response.cards.length === 0 ||
    !response.cards.every(isPokeTraceCatalogCard)
  ) {
    throw new Error("Invalid PokeTrace catalog response");
  }
  return response as PokeTraceCatalogResponse;
}

export function toPokeTraceCatalogPokemonCard(card: PokeTraceCatalogCard) {
  const tcgplayerPrices = Object.fromEntries(
    Object.entries(card.conditionPrices).map(([condition, price]) => [
      condition,
      { avg: price },
    ]),
  );

  return {
    id: card.id,
    name: card.name,
    ...(card.number && { number: card.number }),
    ...(card.rarity && { rarity: card.rarity }),
    image: card.image,
    set: { id: "", name: card.setName },
    pokeTrace: {
      currency: card.currency,
      marketplaceUrls: {},
      prices:
        Object.keys(tcgplayerPrices).length > 0
          ? { tcgplayer: tcgplayerPrices }
          : {},
      ...(card.variant && { variant: card.variant }),
    },
  };
}
