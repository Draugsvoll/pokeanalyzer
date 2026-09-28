import type {
  PortfolioCard,
  PortfolioComparisonPeriod,
} from "../../types/portfolio";
import { formatCardNumber } from "../../../shared/formatCardNumber";
import {
  resolveDisplayedPokeTracePriceChange,
  resolvePokeTraceCardPrice,
} from "../../utils/pokeTracePricing";

export type PortfolioSort =
  | "unsorted"
  | "name-az"
  | "price-high"
  | "price-low"
  | "holding-high"
  | "change-high"
  | "change-low";

export function portfolioQuantity(card: PortfolioCard) {
  return Number.isSafeInteger(card.quantity) && card.quantity > 0
    ? card.quantity
    : 1;
}

export function portfolioPrice(card: PortfolioCard) {
  return resolvePokeTraceCardPrice(card)?.price ?? null;
}

export function portfolioPriceChange(
  card: PortfolioCard,
  period: PortfolioComparisonPeriod,
) {
  return resolveDisplayedPokeTracePriceChange(card, {
    comparisonPriceSnapshot: card.priceSnapshots?.[period] ?? null,
  }).percent;
}

function compareText(left: string | undefined, right: string | undefined) {
  return (left ?? "").localeCompare(right ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  direction: "ascending" | "descending",
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return direction === "descending" ? right - left : left - right;
}

export function getVisiblePortfolioCards(
  cards: PortfolioCard[],
  filter: string,
  sort: PortfolioSort,
  period: PortfolioComparisonPeriod,
) {
  const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = terms.length
    ? cards.filter((card) => {
        const searchable = [
          card.name,
          card.set?.name,
          card.number,
          formatCardNumber(card),
          card.rarity,
          card.pokeTrace.variant?.replaceAll("_", " "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
    : cards;

  if (sort === "unsorted") return filtered;

  return [...filtered].sort((left, right) => {
    let comparison: number;

    if (sort === "name-az") {
      comparison = compareText(left.name, right.name);
    } else if (sort === "price-high" || sort === "price-low") {
      comparison = compareNullableNumbers(
        portfolioPrice(left),
        portfolioPrice(right),
        sort === "price-high" ? "descending" : "ascending",
      );
    } else if (sort === "holding-high") {
      const leftPrice = portfolioPrice(left);
      const rightPrice = portfolioPrice(right);
      comparison = compareNullableNumbers(
        leftPrice == null ? null : leftPrice * portfolioQuantity(left),
        rightPrice == null ? null : rightPrice * portfolioQuantity(right),
        "descending",
      );
    } else {
      comparison = compareNullableNumbers(
        portfolioPriceChange(left, period),
        portfolioPriceChange(right, period),
        sort === "change-high" ? "descending" : "ascending",
      );
    }

    return (
      comparison ||
      compareText(left.name, right.name) ||
      compareText(left.set?.name, right.set?.name) ||
      compareText(left.id, right.id)
    );
  });
}

export function getPortfolioStats(
  cards: PortfolioCard[],
  period: PortfolioComparisonPeriod,
) {
  let totalCards = 0;
  let totalValue = 0;
  let comparableCurrentValue = 0;
  let comparablePreviousValue = 0;
  let comparableCards = 0;
  let pricedCards = 0;
  let topHolding: { card: PortfolioCard; value: number } | null = null;

  for (const card of cards) {
    const copies = portfolioQuantity(card);
    const currentPrice = portfolioPrice(card);
    const comparisonPrice = card.priceSnapshots?.[period]?.marketPrice;
    totalCards += copies;

    if (currentPrice != null) {
      pricedCards += copies;
      const holdingValue = currentPrice * copies;
      totalValue += holdingValue;
      if (!topHolding || holdingValue > topHolding.value) {
        topHolding = { card, value: holdingValue };
      }

      if (
        typeof comparisonPrice === "number" &&
        Number.isFinite(comparisonPrice) &&
        comparisonPrice > 0
      ) {
        comparableCurrentValue += holdingValue;
        comparablePreviousValue += comparisonPrice * copies;
        comparableCards += copies;
      }
    }
  }

  const changeAmount = comparableCurrentValue - comparablePreviousValue;
  const changePercent =
    comparablePreviousValue > 0
      ? (changeAmount / comparablePreviousValue) * 100
      : null;

  return {
    changeAmount: changePercent == null ? null : changeAmount,
    changePercent,
    comparableCards,
    pricedCards,
    topHolding,
    totalCards,
    totalValue,
    uniqueCards: cards.length,
  };
}
