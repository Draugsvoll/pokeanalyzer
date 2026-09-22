import { useEffect, useState, type ReactNode } from "react";
import type { MarketMoverItem } from "../../../shared/marketMovers";
import { isAbortError } from "../../hooks/useAbortableRequest";
import type { MarketMoversFetcher } from "../../services/marketMoversApi";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import {
  CardCategoryGrid,
  type CardCategoryGridItem,
} from "../cardCategoryGrid/CardCategoryGrid";

type MarketMoversGridProps = {
  changeLabel?: string;
  emptyMessage?: ReactNode;
  loadMovers: MarketMoversFetcher;
  subtitle?: ReactNode;
  title: ReactNode;
};

const GRADER_LABELS = new Set(["ACE", "BGS", "CGC", "PSA", "SGC", "TAG"]);

function sourceLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "tcgplayer") return "TCG";
  if (normalized === "ebay") return "eBay";
  return value;
}

function tierLabel(value: string) {
  return value
    .split("_")
    .map((part) =>
      GRADER_LABELS.has(part)
        ? part
        : `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

function compactTierLabel(value: string) {
  const normalized = value.toUpperCase();
  const labels: Record<string, string> = {
    DAMAGED: "DMG",
    HEAVILY_PLAYED: "HP",
    LIGHTLY_PLAYED: "LP",
    MODERATELY_PLAYED: "MP",
    NEAR_MINT: "NM",
  };
  return labels[normalized] ?? tierLabel(value);
}

function toGridItem(
  item: MarketMoverItem,
  changeLabel?: string,
): CardCategoryGridItem {
  const image = item.image ?? "";
  const card: PokemonCard = {
    id: item.cardId,
    name: item.name,
    ...(item.cardNumber && { number: item.cardNumber }),
    ...(item.rarity && { rarity: item.rarity }),
    images: { large: image, small: image },
    set: { id: item.set.slug, name: item.set.name },
    pokeTrace: {
      currency: item.currency,
      marketplaceUrls: {},
      prices: {},
      ...(item.variant && { variant: item.variant }),
    },
  };
  const marketName = `${sourceLabel(item.source)} · ${tierLabel(item.tier)}`;
  return {
    card,
    marketDisplay: {
      changeLabel: changeLabel ?? `Change from the 7-day ${marketName} average`,
      changePercent: item.changePct,
      currency: item.currency,
      marketLabel: `${compactTierLabel(item.tier)} · ${sourceLabel(item.source)}`,
      price: item.currentPrice,
      priceLabel: marketName,
    },
  };
}

export function MarketMoversGrid({
  changeLabel,
  emptyMessage,
  loadMovers,
  subtitle,
  title,
}: MarketMoversGridProps) {
  const [result, setResult] = useState<{
    error: string | null;
    items: CardCategoryGridItem[];
    loading: boolean;
  }>({ error: null, items: [], loading: true });

  useEffect(() => {
    const controller = new AbortController();

    void loadMovers(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setResult({
          error: null,
          items: response.items.map((item) => toGridItem(item, changeLabel)),
          loading: false,
        });
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted || isAbortError(requestError)) return;
        logClientError("Failed to load market movers", requestError);
        setResult({
          error: "Market movers are temporarily unavailable.",
          items: [],
          loading: false,
        });
      });

    return () => controller.abort();
  }, [changeLabel, loadMovers]);

  return (
    <CardCategoryGrid
      emptyMessage={emptyMessage}
      error={result.error}
      items={result.items}
      loading={result.loading}
      subtitle={subtitle}
      title={title}
    />
  );
}
