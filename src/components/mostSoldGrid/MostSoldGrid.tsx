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
  loadCards?: MostSoldFetcher;
  title?: ReactNode;
};

function sourceLabel(source: MostSoldResponse["source"]) {
  return source === "tcgplayer" ? "TCGPlayer" : "eBay";
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
  return {
    card,
    marketDisplay: {
      currency: item.currency,
      marketLabel: salesLabel,
      price: item.currentPrice,
      priceLabel: `${salesLabel} on ${market} across ${condition} during the last ${response.periodDays} ${response.periodDays === 1 ? "day" : "days"}`,
    },
  };
}

export function MostSoldGrid({
  loadCards = mostSoldCards,
  title = "Most Sold",
}: MostSoldGridProps = {}) {
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
  }, [loadCards]);

  return (
    <CardCategoryGrid
      emptyMessage="Most-sold cards will appear after sales snapshots are available."
      error={result.error}
      items={result.items}
      loading={result.loading}
      subtitle=""
      title={title}
    />
  );
}
