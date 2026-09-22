import { useEffect, useState } from "react";
import { isAbortError } from "../../hooks/useAbortableRequest";
import {
  mostSoldCards,
  type StaticMostSoldItem,
  type StaticMostSoldResponse,
} from "../../services/staticMarketCategories";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import {
  CardCategoryGrid,
  type CardCategoryGridItem,
} from "../cardCategoryGrid/CardCategoryGrid";

function sourceLabel(source: StaticMostSoldResponse["source"]) {
  if (source === "both") return "TCG + eBay";
  return source === "tcgplayer" ? "TCG" : "eBay";
}

function toGridItem(
  item: StaticMostSoldItem,
  source: StaticMostSoldResponse["source"],
): CardCategoryGridItem {
  const image = item.image ?? "";
  const setName = item.setName ?? "Unknown set";
  const card: PokemonCard = {
    id: item.cardId,
    name: item.name,
    ...(item.cardNumber && { number: item.cardNumber }),
    ...(item.rarity && { rarity: item.rarity }),
    images: { large: image, small: image },
    set: { id: setName, name: setName },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices: {},
      ...(item.variant && { variant: item.variant }),
    },
  };
  const market = sourceLabel(source);
  return {
    card,
    marketDisplay: {
      currency: "USD",
      marketLabel: `sales · ${market}`,
      priceLabel: `${item.totalSales.toLocaleString("en-US")} reported sales across all stored conditions on ${market}`,
      primaryText: item.totalSales.toLocaleString("en-US"),
    },
  };
}

export function MostSoldGrid() {
  const [result, setResult] = useState<{
    error: string | null;
    items: CardCategoryGridItem[];
    loading: boolean;
  }>({ error: null, items: [], loading: true });

  useEffect(() => {
    const controller = new AbortController();
    void mostSoldCards(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setResult({
          error: null,
          items: response.items.map((item) =>
            toGridItem(item, response.source),
          ),
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
  }, []);

  return (
    <CardCategoryGrid
      emptyMessage="Most-sold cards will appear after sales snapshots are available."
      error={result.error}
      items={result.items}
      loading={result.loading}
      subtitle=""
      title="Most Sold"
    />
  );
}
