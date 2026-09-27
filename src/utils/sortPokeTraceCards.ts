import type { PokeTraceSearchSort } from "../../shared/pokeTraceSearch";
import type { PokeTraceRawCondition } from "../../shared/pokeTraceMarketConditions";
import type { PokemonCard } from "../types/pokemon";
import {
  resolveDisplayedPokeTracePriceChange,
  resolvePokeTraceCardPrice,
  type PokeTracePriceChangeDisplayContext,
} from "./pokeTracePricing";

export type PokeTraceCardSort = "none" | PokeTraceSearchSort;
export const POKETRACE_DEFAULT_CARD_SORT: PokeTraceCardSort = "none";

export type PokeTraceCardSortOptions = {
  condition?: PokeTraceRawCondition;
  getPriceChangeDisplayContext?: (
    card: PokemonCard,
  ) => PokeTracePriceChangeDisplayContext;
};

const CARD_NUMBER_COLLATOR = new Intl.Collator("en-US", {
  numeric: true,
  sensitivity: "base",
});

function compareText(left: string | undefined, right: string | undefined) {
  return (left ?? "").localeCompare(right ?? "", "en-US");
}

function compareCardNumbers(
  left: string | undefined,
  right: string | undefined,
  descending: boolean,
) {
  const leftNumber = left?.trim() ?? "";
  const rightNumber = right?.trim() ?? "";
  if (!leftNumber && rightNumber) return 1;
  if (leftNumber && !rightNumber) return -1;
  if (!leftNumber && !rightNumber) return 0;
  const comparison = CARD_NUMBER_COLLATOR.compare(leftNumber, rightNumber);
  return descending ? -comparison : comparison;
}

export function sortPokeTraceCards(
  cards: readonly PokemonCard[],
  sort: PokeTraceCardSort,
  options: PokeTraceCardSortOptions = {},
) {
  if (sort === "none") return [...cards];

  const displayedChanges =
    sort === "change-high-low" || sort === "change-low-high"
      ? new Map(
          cards.map((card) => [
            card,
            resolveDisplayedPokeTracePriceChange(
              card,
              options.getPriceChangeDisplayContext?.(card),
            ).percent,
          ]),
        )
      : null;

  return [...cards].sort((left, right) => {
    if (sort === "change-high-low" || sort === "change-low-high") {
      const leftChange = displayedChanges?.get(left) ?? null;
      const rightChange = displayedChanges?.get(right) ?? null;
      if (leftChange === null && rightChange !== null) return 1;
      if (leftChange !== null && rightChange === null) return -1;
      if (
        leftChange !== null &&
        rightChange !== null &&
        leftChange !== rightChange
      ) {
        return sort === "change-high-low"
          ? rightChange - leftChange
          : leftChange - rightChange;
      }
      return (
        compareText(left.name, right.name) ||
        compareText(left.number, right.number) ||
        compareText(left.pokeTrace.variant, right.pokeTrace.variant) ||
        compareText(left.id, right.id)
      );
    }

    if (sort === "card-number-low-high" || sort === "card-number-high-low") {
      return (
        compareCardNumbers(
          left.number,
          right.number,
          sort === "card-number-high-low",
        ) ||
        compareText(left.set.name, right.set.name) ||
        compareText(left.name, right.name) ||
        compareText(left.pokeTrace.variant, right.pokeTrace.variant) ||
        compareText(left.id, right.id)
      );
    }

    const condition = options.condition ?? "NEAR_MINT";
    const leftPrice = resolvePokeTraceCardPrice(left, condition)?.price ?? null;
    const rightPrice =
      resolvePokeTraceCardPrice(right, condition)?.price ?? null;
    if (leftPrice === null && rightPrice !== null) return 1;
    if (leftPrice !== null && rightPrice === null) return -1;
    if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) {
      return sort === "price-high-low"
        ? rightPrice - leftPrice
        : leftPrice - rightPrice;
    }
    return (
      compareText(left.name, right.name) ||
      compareText(left.set.name, right.set.name) ||
      compareText(left.number, right.number) ||
      compareText(left.pokeTrace.variant, right.pokeTrace.variant) ||
      compareText(left.id, right.id)
    );
  });
}
