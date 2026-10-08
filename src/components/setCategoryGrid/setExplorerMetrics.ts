import {
  calculateDisplayedPriceChangePercent,
  MINIMUM_GAINER_LOSER_PRICE,
} from "../../../shared/pokeTracePriceChange";
import type { PriceChangePeriod } from "../../../shared/priceChangePeriod";
import type { PokeTraceSetSalesLeaders } from "../../../shared/pokeTraceSet";
import type { PokemonCard } from "../../types/pokemon";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";
import { selectUniqueSetCards } from "./setCardScope";

export type SetExplorerOverview = {
  bestPerformer: (SetFeaturedCard & { percentChange: number }) | null;
  changePeriod: PriceChangePeriod;
  currency: string;
  mostValuable: SetFeaturedCard | null;
  mostSold: SetSalesLeader | null;
  movementPercent: number | null;
  pricedCards: number;
  totalCards: number;
  totalValue: number;
  uniqueCards: number;
  variantCards: number;
};

type SetFeaturedCard = {
  card: PokemonCard;
  percentChange: number | null;
  price: number;
};

type SetSalesLeader = {
  card: PokemonCard;
  currency: string;
  percentChange: number | null;
  price: number | null;
};

function dominantCurrency(cards: readonly PokemonCard[]) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const price = resolvePokeTraceCardPrice(card, "NEAR_MINT");
    if (!price) continue;
    counts.set(price.currency, (counts.get(price.currency) ?? 0) + 1);
  }

  return (
    [...counts].sort(
      ([leftCurrency, leftCount], [rightCurrency, rightCount]) =>
        rightCount - leftCount || leftCurrency.localeCompare(rightCurrency),
    )[0]?.[0] ?? "USD"
  );
}

export function buildSetExplorerOverview(
  cards: readonly PokemonCard[],
  salesLeaders?: PokeTraceSetSalesLeaders | null,
  salesLeaderCards: readonly PokemonCard[] = cards,
): SetExplorerOverview {
  const changePeriod = "7d" satisfies PriceChangePeriod;
  const currency = dominantCurrency(cards);
  let currentValue = 0;
  let previousValue = 0;
  let pricedCards = 0;
  let bestPerformer: SetExplorerOverview["bestPerformer"] = null;
  let mostValuable: SetExplorerOverview["mostValuable"] = null;
  let totalValue = 0;

  for (const card of cards) {
    const currentPrice = resolvePokeTraceCardPrice(card, "NEAR_MINT");
    if (currentPrice?.currency !== currency) continue;

    pricedCards += 1;
    totalValue += currentPrice.price;
    const percentChange = calculateDisplayedPriceChangePercent(
      currentPrice.price,
      card.pokeTrace.marketPriceSnapshots?.[changePeriod],
    );
    if (!mostValuable || currentPrice.price > mostValuable.price) {
      mostValuable = {
        card,
        percentChange,
        price: currentPrice.price,
      };
    }
    if (
      currentPrice.price >= MINIMUM_GAINER_LOSER_PRICE &&
      percentChange !== null &&
      (!bestPerformer || percentChange > bestPerformer.percentChange)
    ) {
      bestPerformer = { card, percentChange, price: currentPrice.price };
    }

    const previousPrice = card.pokeTrace.marketPriceSnapshots?.[changePeriod];
    if (
      typeof previousPrice !== "number" ||
      !Number.isFinite(previousPrice) ||
      previousPrice <= 0
    ) {
      continue;
    }
    currentValue += currentPrice.price;
    previousValue += previousPrice;
  }

  const resolveSalesLeader = (
    leader: PokeTraceSetSalesLeaders["total"] | undefined,
  ): SetSalesLeader | null => {
    if (!leader) return null;
    const card = salesLeaderCards.find(({ id }) => id === leader.cardId);
    if (!card) return null;

    const currentPrice = resolvePokeTraceCardPrice(card, "NEAR_MINT");
    return {
      ...leader,
      card,
      currency: currentPrice?.currency ?? card.pokeTrace.currency ?? currency,
      percentChange: currentPrice
        ? calculateDisplayedPriceChangePercent(
            currentPrice.price,
            card.pokeTrace.marketPriceSnapshots?.[changePeriod],
          )
        : null,
      price: currentPrice?.price ?? null,
    };
  };

  const uniqueCards = selectUniqueSetCards(salesLeaderCards).length;

  return {
    bestPerformer,
    changePeriod,
    currency,
    mostValuable,
    mostSold: resolveSalesLeader(salesLeaders?.total),
    movementPercent:
      previousValue > 0
        ? ((currentValue - previousValue) / previousValue) * 100
        : null,
    pricedCards,
    totalCards: cards.length,
    totalValue,
    uniqueCards,
    variantCards: Math.max(0, salesLeaderCards.length - uniqueCards),
  };
}
