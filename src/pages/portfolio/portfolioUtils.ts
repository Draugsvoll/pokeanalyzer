import { formatCardNumber } from "../../../shared/formatCardNumber";
import type {
  PortfolioComparisonPeriod,
  PortfolioItem,
} from "../../types/portfolio";
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

export type PortfolioFeaturedMetric = {
  item: PortfolioItem;
  change: number | null;
  value: number;
};

export function portfolioQuantity(item: PortfolioItem) {
  return Number.isSafeInteger(item.quantity) && item.quantity > 0
    ? item.quantity
    : 1;
}

export function portfolioPrice(item: PortfolioItem) {
  return item.type === "single"
    ? (resolvePokeTraceCardPrice(item)?.price ?? null)
    : item.price;
}

export function portfolioCurrency(item: PortfolioItem) {
  return item.type === "single"
    ? (resolvePokeTraceCardPrice(item)?.currency ?? item.pokeTrace.currency)
    : item.currency;
}

export function portfolioComparisonPrice(
  item: PortfolioItem,
  period: PortfolioComparisonPeriod,
) {
  return item.type === "single"
    ? (item.priceSnapshots?.[period]?.marketPrice ?? null)
    : item.priceSnapshots[period];
}

export function portfolioPriceChange(
  item: PortfolioItem,
  period: PortfolioComparisonPeriod,
) {
  if (item.type === "single") {
    return resolveDisplayedPokeTracePriceChange(item, {
      comparisonPriceSnapshot: item.priceSnapshots?.[period] ?? null,
    }).percent;
  }
  const current = item.price;
  const previous = item.priceSnapshots[period];
  if (current == null || previous == null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function portfolioItemNumber(item: PortfolioItem) {
  return item.type === "single" ? formatCardNumber(item) : undefined;
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

export function getVisiblePortfolioItems(
  items: PortfolioItem[],
  filter: string,
  sort: PortfolioSort,
  period: PortfolioComparisonPeriod,
) {
  const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = terms.length
    ? items.filter((item) => {
        const searchable =
          item.type === "single"
            ? [
                item.name,
                item.set?.name,
                item.number,
                formatCardNumber(item),
                item.rarity,
                item.pokeTrace.variant?.replaceAll("_", " "),
                "single",
              ]
            : [
                item.name,
                item.setName,
                item.productFamily.replaceAll("_", " "),
                item.variant?.replaceAll("_", " "),
                "sealed",
              ];
        const text = searchable.filter(Boolean).join(" ").toLowerCase();
        return terms.every((term) => text.includes(term));
      })
    : items;

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
    const leftSet = left.type === "single" ? left.set?.name : left.setName;
    const rightSet = right.type === "single" ? right.set?.name : right.setName;
    return (
      comparison ||
      compareText(left.name, right.name) ||
      compareText(leftSet, rightSet) ||
      compareText(left.id, right.id)
    );
  });
}

export function getPortfolioStats(
  items: PortfolioItem[],
  period: PortfolioComparisonPeriod,
) {
  let totalAssets = 0;
  let singleAssets = 0;
  let sealedAssets = 0;
  let totalValue = 0;
  let comparableCurrentValue = 0;
  let comparablePreviousValue = 0;
  let pricedAssets = 0;
  let biggestGainer: (PortfolioFeaturedMetric & { change: number }) | null =
    null;
  let weakestPerformer: (PortfolioFeaturedMetric & { change: number }) | null =
    null;
  let topHolding: PortfolioFeaturedMetric | null = null;
  const valueCurrency = items
    .map((item) =>
      portfolioPrice(item) == null ? null : portfolioCurrency(item),
    )
    .find((currency): currency is string => Boolean(currency));
  let excludedCurrencyAssets = 0;

  for (const item of items) {
    const quantity = portfolioQuantity(item);
    const currentPrice = portfolioPrice(item);
    const comparisonPrice = portfolioComparisonPrice(item, period);
    totalAssets += quantity;
    if (item.type === "single") singleAssets += quantity;
    else sealedAssets += quantity;

    if (currentPrice != null) {
      if (portfolioCurrency(item) !== valueCurrency) {
        excludedCurrencyAssets += quantity;
        continue;
      }
      pricedAssets += quantity;
      const holdingValue = currentPrice * quantity;
      const change = portfolioPriceChange(item, period);
      totalValue += holdingValue;
      if (!topHolding || currentPrice > topHolding.value) {
        topHolding = { item, change, value: currentPrice };
      }
      if (change != null && (!biggestGainer || change > biggestGainer.change)) {
        biggestGainer = { item, change, value: holdingValue };
      }
      if (
        change != null &&
        (!weakestPerformer || change < weakestPerformer.change)
      ) {
        weakestPerformer = { item, change, value: holdingValue };
      }
      if (comparisonPrice != null && comparisonPrice > 0) {
        comparableCurrentValue += holdingValue;
        comparablePreviousValue += comparisonPrice * quantity;
      }
    }
  }

  const changeAmount = comparableCurrentValue - comparablePreviousValue;
  const changePercent =
    comparablePreviousValue > 0
      ? (changeAmount / comparablePreviousValue) * 100
      : null;

  return {
    biggestGainer,
    weakestPerformer,
    changePercent,
    excludedCurrencyAssets,
    pricedAssets,
    sealedAssets,
    singleAssets,
    topHolding,
    totalAssets,
    totalValue,
    uniqueAssets: items.length,
    valueCurrency: valueCurrency ?? "USD",
  };
}
