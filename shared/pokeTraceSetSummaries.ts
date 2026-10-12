import type { PokeTraceCatalogCard } from "./pokeTraceCatalog.js";
import { POKETRACE_CURRENCY } from "./pokeTraceCurrency.js";
import { calculateDisplayedPriceChangePercent } from "./pokeTracePriceChange.js";
import { selectUniqueSetCardsByPrice } from "./selectUniqueSetCards.js";

export type PokeTraceSetSummary = {
  asOf: string;
  comparableCards: number;
  currency: string;
  pricedCards: number;
  setName: string;
  sevenDayChangePercent: number | null;
  uniqueCards: number;
};

function nearMintPrice(card: PokeTraceCatalogCard) {
  const price = card.conditionPrices.NEAR_MINT;
  return typeof price === "number" && Number.isFinite(price) && price > 0
    ? price
    : null;
}

function summarizeSet(
  setName: string,
  cards: readonly PokeTraceCatalogCard[],
  asOf: string,
): PokeTraceSetSummary {
  const uniqueCards = selectUniqueSetCardsByPrice(cards, nearMintPrice);
  const currency = POKETRACE_CURRENCY;
  let comparableCards = 0;
  let currentComparableValue = 0;
  let previousComparableValue = 0;
  let pricedCards = 0;

  for (const card of uniqueCards) {
    const currentPrice = nearMintPrice(card);
    if (currentPrice === null) continue;
    pricedCards += 1;

    const previousPrice = card.priceSnapshots["7d"];
    if (
      typeof previousPrice !== "number" ||
      !Number.isFinite(previousPrice) ||
      previousPrice <= 0
    ) {
      continue;
    }

    comparableCards += 1;
    currentComparableValue += currentPrice;
    previousComparableValue += previousPrice;
  }

  return {
    asOf,
    comparableCards,
    currency,
    pricedCards,
    setName,
    sevenDayChangePercent: calculateDisplayedPriceChangePercent(
      currentComparableValue,
      previousComparableValue,
    ),
    uniqueCards: uniqueCards.length,
  };
}

export function createPokeTraceSetSummaries(
  cards: readonly PokeTraceCatalogCard[],
  asOf: string,
) {
  const cardsBySet = new Map<string, PokeTraceCatalogCard[]>();
  const setNames = new Map<string, string>();

  for (const card of cards) {
    const key = card.setName.trim().toLocaleLowerCase("en-US");
    if (!key) continue;
    setNames.set(key, card.setName.trim());
    const setCards = cardsBySet.get(key);
    if (setCards) setCards.push(card);
    else cardsBySet.set(key, [card]);
  }

  return [...cardsBySet.entries()]
    .map(([key, setCards]) =>
      summarizeSet(setNames.get(key) ?? setCards[0].setName, setCards, asOf),
    )
    .sort((left, right) =>
      left.setName.localeCompare(right.setName, "en-US", {
        sensitivity: "base",
      }),
    );
}
