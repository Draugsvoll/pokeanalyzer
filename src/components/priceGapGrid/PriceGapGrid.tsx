import { useEffect, useState, type ReactNode } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import {
  tcgCardmarketPriceGaps,
  type PriceGapItem,
  type PriceGapsResponse,
} from "../../services/marketCategoriesApi";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import {
  CardCategoryGrid,
  type CardCategoryGridItem,
} from "../cardCategoryGrid/CardCategoryGrid";

type PriceGapFetcher = (signal?: AbortSignal) => Promise<PriceGapsResponse>;

function toGridItem(item: PriceGapItem): CardCategoryGridItem {
  const setName = item.setName ?? "Unknown set";
  const card: PokemonCard = {
    id: item.cardId,
    name: item.name,
    ...(item.cardNumber && { number: item.cardNumber }),
    ...(item.rarity && { rarity: item.rarity }),
    image: item.image ?? "",
    set: { id: setName, name: setName },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices: { tcgplayer: { NEAR_MINT: { avg: item.tcgPrice } } },
      ...(item.variant && { variant: item.variant }),
    },
  };
  return {
    card,
    marketDisplay: {
      trendPrice: {
        amount: item.cardmarketTrend,
        currency: "EUR",
        higher: item.cardmarketTrend > item.tcgPrice,
      },
    },
  };
}

export function PriceGapGrid({
  loadCards = tcgCardmarketPriceGaps,
  minimized = false,
  title = "Price Gaps - TCG and Cardmarket",
}: {
  loadCards?: PriceGapFetcher;
  minimized?: boolean;
  title?: ReactNode;
} = {}) {
  const [result, setResult] = useState<{
    error: string | null;
    items: CardCategoryGridItem[];
    loading: boolean;
  }>({ error: null, items: [], loading: true });

  useEffect(() => {
    const controller = new AbortController();
    void loadCards(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setResult({
          error: null,
          items: response.items.map(toGridItem),
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        logClientError("Failed to load price gap cards", error);
        setResult({
          error: "Price gap cards are temporarily unavailable.",
          items: [],
          loading: false,
        });
      });
    return () => controller.abort();
  }, [loadCards]);

  return (
    <CardCategoryGrid
      emptyMessage="No cards currently meet the price gap criteria."
      error={result.error}
      items={result.items}
      loading={result.loading}
      minimized={minimized}
      subtitle=""
      title={title}
    />
  );
}
