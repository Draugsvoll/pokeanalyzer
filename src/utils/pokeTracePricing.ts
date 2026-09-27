import type { PokemonCard } from "../types/pokemon";
import type { PokeTraceRawCondition } from "../../shared/pokeTraceMarketConditions";
import {
  calculateDisplayedPriceChangePercent,
  normalizeDisplayedPriceChangePercent,
} from "../../shared/pokeTracePriceChange";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function currencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat("en-US", {
        currency,
        currencyDisplay: "narrowSymbol",
        style: "currency",
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? `${currency} `
    );
  } catch {
    return `${currency} `;
  }
}

export function resolvePokeTraceCardPrice(
  card: PokemonCard,
  condition: PokeTraceRawCondition = "NEAR_MINT",
) {
  const prices = record(card.pokeTrace.prices);
  const tcgplayer = record(prices?.tcgplayer);
  const conditionPrice = record(tcgplayer?.[condition]);
  const price = conditionPrice?.avg;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  const currency = card.pokeTrace.currency || "USD";
  return {
    currency,
    currencySymbol: currencySymbol(currency),
    price,
  };
}

export function resolvePokeTraceSevenDayComparison(card: PokemonCard) {
  const comparison = card.pokeTrace.marketComparisons?.comparisons["7d"];
  if (comparison) {
    return {
      marketPrice: comparison.marketPrice,
      recordedAt: comparison.recordedAt,
    };
  }

  const marketPrice = card.pokeTrace.marketPriceSnapshots?.["7d"];
  if (
    typeof marketPrice !== "number" ||
    !Number.isFinite(marketPrice) ||
    marketPrice <= 0
  ) {
    return undefined;
  }

  return { marketPrice, recordedAt: null };
}

type DisplayedPriceChangeOptions = {
  comparisonPrice?: number | null;
  currentPrice?: number | null;
  explicitChangePercent?: number | null;
  useDefaultSevenDay?: boolean;
};

export type PokeTracePriceChangeDisplayContext = {
  comparisonPriceSnapshot?: { marketPrice: number } | null;
  marketDisplay?: {
    changePercent?: number;
    condition?: string;
    price?: number;
    source?: string;
  };
};

export function resolveDisplayedPokeTracePriceChangePercent(
  card: PokemonCard,
  options: DisplayedPriceChangeOptions = {},
) {
  if (options.explicitChangePercent != null) {
    return normalizeDisplayedPriceChangePercent(options.explicitChangePercent);
  }

  const currentPrice =
    options.currentPrice === undefined
      ? resolvePokeTraceCardPrice(card)?.price
      : options.currentPrice;
  const comparisonPrice =
    options.comparisonPrice === undefined &&
    options.useDefaultSevenDay !== false
      ? resolvePokeTraceSevenDayComparison(card)?.marketPrice
      : options.comparisonPrice;

  return calculateDisplayedPriceChangePercent(currentPrice, comparisonPrice);
}

function displaysTcgPlayerNearMint(
  marketDisplay: PokeTracePriceChangeDisplayContext["marketDisplay"],
) {
  if (!marketDisplay) return true;
  return (
    marketDisplay.source?.trim().toLowerCase() === "tcgplayer" &&
    marketDisplay.condition?.trim().toUpperCase() === "NEAR_MINT"
  );
}

export function resolveDisplayedPokeTracePriceChange(
  card: PokemonCard,
  context: PokeTracePriceChangeDisplayContext = {},
) {
  const { comparisonPriceSnapshot, marketDisplay } = context;
  const displayedPrice =
    marketDisplay?.price ?? resolvePokeTraceCardPrice(card)?.price;
  const defaultSevenDayComparison =
    displayedPrice != null &&
    comparisonPriceSnapshot === undefined &&
    marketDisplay?.changePercent == null &&
    displaysTcgPlayerNearMint(marketDisplay)
      ? resolvePokeTraceSevenDayComparison(card)
      : undefined;
  const comparisonPrice =
    comparisonPriceSnapshot?.marketPrice ??
    defaultSevenDayComparison?.marketPrice;
  const percent = resolveDisplayedPokeTracePriceChangePercent(card, {
    comparisonPrice,
    currentPrice: displayedPrice,
    explicitChangePercent: marketDisplay?.changePercent,
    useDefaultSevenDay: Boolean(defaultSevenDayComparison),
  });

  return {
    defaultSevenDayComparison,
    percent,
    show:
      marketDisplay?.changePercent != null ||
      comparisonPriceSnapshot != null ||
      defaultSevenDayComparison != null,
  };
}
