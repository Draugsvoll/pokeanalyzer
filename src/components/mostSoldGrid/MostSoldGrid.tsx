import { useEffect, useState, type ReactNode } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import {
  mostSoldCards,
  type MostSoldItem,
  type MostSoldResponse,
} from "../../services/marketCategoriesApi";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import {
  CardCategoryGrid,
  type CardCategoryGridItem,
} from "../cardCategoryGrid/CardCategoryGrid";

type MostSoldFetcher = (signal?: AbortSignal) => Promise<MostSoldResponse>;

type MostSoldGridProps = {
  minimized?: boolean;
  loadCards?: MostSoldFetcher;
  title?: ReactNode;
};

function sourceLabel(source: MostSoldResponse["source"]) {
  return source === "tcgplayer" ? "TCGPlayer" : "Ebay";
}

function toGridItem(
  item: MostSoldItem,
  response: MostSoldResponse,
): CardCategoryGridItem {
  const image = item.image ?? "";
  const setName = item.setName ?? "Unknown set";
  const card: PokemonCard = {
    id: item.cardId,
    name: item.name,
    ...(item.cardNumber && { number: item.cardNumber }),
    ...(item.rarity && { rarity: item.rarity }),
    image,
    set: { id: setName, name: setName },
    pokeTrace: {
      currency: item.currency,
      ...(item.priceSnapshots && {
        marketPriceSnapshots: item.priceSnapshots,
      }),
      marketplaceUrls: {},
      prices: { [response.source]: item.prices },
      ...(item.variant && { variant: item.variant }),
    },
  };
  const market = sourceLabel(response.source);
  const salesLabel = `${item.newSales.toLocaleString("en-US")} new ${item.newSales === 1 ? "sale" : "sales"}`;
  const condition =
    response.condition === "ALL"
      ? "all stored conditions"
      : response.condition.toLowerCase().replaceAll("_", " ");
  const displayedPriceCondition =
    response.condition === "ALL" ? "NEAR_MINT" : response.condition;
  const periodLabel =
    response.comparisonSnapshotDate && response.currentSnapshotDate
      ? `from ${response.comparisonSnapshotDate} to ${response.currentSnapshotDate}`
      : `over ${response.periodDays} ${response.periodDays === 1 ? "day" : "days"}`;
  return {
    card,
    marketDisplay: {
      condition: displayedPriceCondition,
      price: item.currentPrice,
      priceLabel: `${salesLabel} on ${market} across ${condition} ${periodLabel}`,
      source: response.source,
    },
  };
}

export function MostSoldGrid({
  minimized = false,
  loadCards = mostSoldCards,
  title = "Most Sold Daily",
}: MostSoldGridProps = {}) {
  const [result, setResult] = useState<{
    error: string | null;
    status?: MostSoldResponse["status"];
    items: CardCategoryGridItem[];
    loading: boolean;
  }>({ error: null, items: [], loading: true });
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadCards(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setResult({
          error: null,
          status: response.status,
          items: response.items.map((item) => toGridItem(item, response)),
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        logClientError("Failed to load most-sold cards", error);
        setResult({
          error: "Most-sold cards are temporarily unavailable.",
          items: [],
          loading: false,
        });
      });
    return () => controller.abort();
  }, [loadCards, requestVersion]);

  function retry() {
    setResult({ error: null, items: [], loading: true });
    setRequestVersion((current) => current + 1);
  }

  return (
    <CardCategoryGrid
      minimized={minimized}
      emptyMessage={
        result.status === "insufficient_history"
          ? "This ranking is temporarily unavailable. Please check back later."
          : "No cards currently meet the sales trend criteria."
      }
      error={result.error}
      items={result.items}
      loading={result.loading}
      onRetry={result.error ? retry : undefined}
      subtitle=""
      title={title}
    />
  );
}
