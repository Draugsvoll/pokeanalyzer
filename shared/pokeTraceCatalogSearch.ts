import type { PokeTraceCatalogCard } from "./pokeTraceCatalog.js";
import type { PokeTraceRawCondition } from "./pokeTraceMarketConditions.js";
import type { PokeTraceSearchSort } from "./pokeTraceSearch.js";

export type PokeTraceCatalogSearch = {
  cardId?: string;
  cardNumber: string;
  condition?: PokeTraceRawCondition | "";
  maxPrice?: number;
  minPrice?: number;
  pokemonName: string;
  rarity?: string;
  setName: string;
  sort?: PokeTraceSearchSort;
};

type PokeTraceCatalogSearchOptions = {
  limit: number;
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function unpaddedCardNumber(value: string) {
  const numerator = value.split("/", 1)[0]?.trim() ?? "";
  return /^\d+$/.test(numerator)
    ? numerator.replace(/^0+(?=\d)/, "")
    : numerator;
}

function compareText(left: string | undefined, right: string | undefined) {
  return (left ?? "").localeCompare(right ?? "", "en-US");
}

export function searchPokeTraceCatalogCards(
  cards: PokeTraceCatalogCard[],
  search: PokeTraceCatalogSearch,
  options: PokeTraceCatalogSearchOptions,
) {
  const pokemonName = normalized(search.pokemonName);
  const setName = normalized(search.setName);
  const cardNumber = normalized(search.cardNumber);
  const rarity = normalized(search.rarity ?? "");
  const cardId = normalized(search.cardId ?? "");
  const condition = search.condition || "NEAR_MINT";
  const results: PokeTraceCatalogCard[] = [];

  for (const card of cards) {
    if (pokemonName && !normalized(card.name).includes(pokemonName)) continue;
    if (setName && !normalized(card.setName).includes(setName)) continue;
    if (cardId && !normalized(card.id).includes(cardId)) continue;
    if (cardNumber) {
      const storedNumber = normalized(card.number ?? "");
      if (
        storedNumber !== cardNumber &&
        unpaddedCardNumber(storedNumber) !== unpaddedCardNumber(cardNumber)
      ) {
        continue;
      }
    }
    if (rarity && normalized(card.rarity ?? "") !== rarity) continue;

    const conditionPrice = card.conditionPrices[condition] ?? null;
    if (search.condition && conditionPrice === null) continue;
    if (
      search.minPrice !== undefined &&
      (conditionPrice === null || conditionPrice < search.minPrice)
    ) {
      continue;
    }
    if (
      search.maxPrice !== undefined &&
      (conditionPrice === null || conditionPrice > search.maxPrice)
    ) {
      continue;
    }

    results.push(card);
  }

  if (search.sort) {
    results.sort((left, right) => {
      const leftPrice = left.conditionPrices[condition] ?? null;
      const rightPrice = right.conditionPrices[condition] ?? null;
      if (leftPrice === null && rightPrice !== null) return 1;
      if (leftPrice !== null && rightPrice === null) return -1;
      if (
        leftPrice !== null &&
        rightPrice !== null &&
        leftPrice !== rightPrice
      ) {
        return search.sort === "price-high-low"
          ? rightPrice - leftPrice
          : leftPrice - rightPrice;
      }
      return (
        compareText(left.name, right.name) ||
        compareText(left.setName, right.setName) ||
        compareText(left.number, right.number) ||
        compareText(left.variant, right.variant) ||
        compareText(left.id, right.id)
      );
    });
  }

  return results.slice(0, options.limit);
}
