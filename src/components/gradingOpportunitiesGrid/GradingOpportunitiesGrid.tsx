import { useEffect, useState, type ReactNode } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import {
  gradingOpportunities,
  type GradingOpportunitiesResponse,
  type GradingOpportunityItem,
} from "../../services/marketCategoriesApi";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import {
  CardCategoryGrid,
  type CardCategoryGridItem,
} from "../cardCategoryGrid/CardCategoryGrid";
import "./GradingOpportunitiesGrid.scss";
import { GradingOpportunityBadge } from "./GradingOpportunityBadge";

type GradingOpportunitiesFetcher = (
  signal?: AbortSignal,
) => Promise<GradingOpportunitiesResponse>;

type GradingOpportunitiesGridProps = {
  defaultExpanded?: boolean;
  loadCards?: GradingOpportunitiesFetcher;
  minimized?: boolean;
  title?: ReactNode;
};

function toGridItem(item: GradingOpportunityItem): CardCategoryGridItem {
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
      marketplaceUrls: {},
      marketComparisons: item.marketComparisons,
      prices: {
        tcgplayer: item.tcgPrices ?? {},
      },
      ...(item.variant && { variant: item.variant }),
    },
  };
  return {
    card,
    badge: <GradingOpportunityBadge multiplier={item.multiplier} />,
  };
}

export function GradingOpportunitiesGrid({
  defaultExpanded = false,
  loadCards = gradingOpportunities,
  minimized = false,
  title = "Grading Opportunities",
}: GradingOpportunitiesGridProps = {}) {
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
        logClientError("Failed to load grading opportunities", error);
        setResult({
          error: "Grading opportunities are temporarily unavailable.",
          items: [],
          loading: false,
        });
      });
    return () => controller.abort();
  }, [loadCards]);

  return (
    <CardCategoryGrid
      allowGradingFilter={false}
      defaultExpanded={defaultExpanded}
      emptyMessage="No cards currently meet the grading criteria."
      error={result.error}
      items={result.items}
      loading={result.loading}
      minimized={minimized}
      subtitle=""
      title={title}
    />
  );
}
