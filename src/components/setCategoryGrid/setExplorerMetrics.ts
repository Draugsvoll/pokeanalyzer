import { calculateDisplayedPriceChangePercent } from "../../../shared/pokeTracePriceChange";
import type { PriceChangePeriod } from "../../../shared/priceChangePeriod";
import type { PokeTraceSetSalesLeaders } from "../../../shared/pokeTraceSet";
import type { PokemonCard } from "../../types/pokemon";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";

export type SetExplorerOverview = {
  changePeriod: PriceChangePeriod;
  currency: string;
  movementPercent: number | null;
  pricedCards: number;
  salesLeaders: {
    leastTotal: SetSalesLeader | null;
    total: SetSalesLeader | null;
  };
  topCard: {
    card: PokemonCard;
    percentChange: number | null;
    price: number;
  } | null;
  totalCards: number;
  totalValue: number;
};

type SetSalesLeader = {
  approximate: boolean;
  card: PokemonCard;
  sales: number;
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
): SetExplorerOverview {
  const changePeriod = "7d" satisfies PriceChangePeriod;
  const currency = dominantCurrency(cards);
  let currentValue = 0;
  let previousValue = 0;
  let pricedCards = 0;
  let topCard: SetExplorerOverview["topCard"] = null;
  let totalValue = 0;

  for (const card of cards) {
    const currentPrice = resolvePokeTraceCardPrice(card, "NEAR_MINT");
    if (currentPrice?.currency !== currency) continue;

    pricedCards += 1;
    totalValue += currentPrice.price;
    if (!topCard || currentPrice.price > topCard.price) {
      topCard = {
        card,
        percentChange: calculateDisplayedPriceChangePercent(
          currentPrice.price,
          card.pokeTrace.marketPriceSnapshots?.[changePeriod],
        ),
        price: currentPrice.price,
      };
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
    const card = cards.find(({ id }) => id === leader.cardId);
    return card ? { ...leader, card } : null;
  };

  return {
    changePeriod,
    currency,
    movementPercent:
      previousValue > 0
        ? ((currentValue - previousValue) / previousValue) * 100
        : null,
    pricedCards,
    salesLeaders: {
      leastTotal: resolveSalesLeader(salesLeaders?.leastTotal),
      total: resolveSalesLeader(salesLeaders?.total),
    },
    topCard,
    totalCards: cards.length,
    totalValue,
  };
}
