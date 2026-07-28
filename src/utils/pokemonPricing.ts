import type { CardMarket, TCGPlayer } from "../types/pokemon/pricing";

export const TCG_PLAYER_VARIANT_ORDER = [
  "normal",
  "holofoil",
  "reverseHolofoil",
  "firstEditionHolofoil",
  "firstEditionNormal",
] as const;

export type TCGPlayerVariantKey = (typeof TCG_PLAYER_VARIANT_ORDER)[number];

export type CardPriceSource = "tcgplayer" | "cardmarket";

export type CardPriceOption = {
  id: string;
  source: CardPriceSource;
  /** Raw key (TCG variant or Cardmarket field name) */
  key: string;
  /** Short print/variant label, e.g. "Holofoil" / "Reverse Holo" */
  label: string;
  price: number;
  currencySymbol: "$" | "€";
};

export function getBestTcgPlayerVariant(
  prices?: TCGPlayer["prices"],
): TCGPlayer["prices"][TCGPlayerVariantKey] | undefined {
  if (!prices) return undefined;

  for (const key of TCG_PLAYER_VARIANT_ORDER) {
    const variant = prices[key];
    if (!variant) continue;

    if (
      variant.market != null ||
      variant.low != null ||
      variant.mid != null ||
      variant.high != null ||
      variant.directLow != null
    ) {
      return variant;
    }
  }

  return undefined;
}

export function getBestTcgPlayerVariantName(
  prices?: TCGPlayer["prices"],
): TCGPlayerVariantKey | undefined {
  if (!prices) return undefined;

  for (const key of TCG_PLAYER_VARIANT_ORDER) {
    const variant = prices[key];
    if (!variant) continue;

    if (
      variant.market != null ||
      variant.low != null ||
      variant.mid != null ||
      variant.high != null ||
      variant.directLow != null
    ) {
      return key;
    }
  }

  return undefined;
}

/** Human-readable TCGPlayer variant label (e.g. reverseHolofoil → "Reverse Holofoil"). */
export function formatTcgPlayerVariantLabel(
  variant?: TCGPlayerVariantKey | string | null,
): string | undefined {
  if (!variant) return undefined;

  const labels: Record<TCGPlayerVariantKey, string> = {
    normal: "Normal",
    holofoil: "Holofoil",
    reverseHolofoil: "Reverse Holo",
    firstEditionHolofoil: "1st Ed. Holo",
    firstEditionNormal: "1st Ed. Normal",
  };

  if (variant in labels) {
    return labels[variant as TCGPlayerVariantKey];
  }

  return variant
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function readPositiveMarket(variant: unknown): number | undefined {
  if (!variant || typeof variant !== "object") return undefined;
  const market = Number((variant as { market?: unknown }).market);
  // Treat 0 / NaN as missing so we keep looking at other variants
  if (!Number.isFinite(market) || market <= 0) return undefined;
  return market;
}

export type TcgPlayerMarketEntry = {
  price: number;
  variant: string;
};

/**
 * Every TCGPlayer variant with a real market price (> 0).
 * Known keys first (fixed order), then any remaining keys.
 */
export function listTcgPlayerMarketEntries(
  prices?: TCGPlayer["prices"] | null,
): TcgPlayerMarketEntry[] {
  if (!prices || typeof prices !== "object") return [];

  const entries: TcgPlayerMarketEntry[] = [];
  const seen = new Set<string>();

  for (const key of TCG_PLAYER_VARIANT_ORDER) {
    seen.add(key);
    const price = readPositiveMarket(prices[key]);
    if (price != null) entries.push({ price, variant: key });
  }

  for (const [key, variant] of Object.entries(prices)) {
    if (seen.has(key)) continue;
    const price = readPositiveMarket(variant);
    if (price != null) entries.push({ price, variant: key });
  }

  return entries;
}

/** First TCGPlayer variant with a real market price (> 0). */
export function getFirstTcgPlayerMarketEntry(
  prices?: TCGPlayer["prices"] | null,
): TcgPlayerMarketEntry | undefined {
  return listTcgPlayerMarketEntries(prices)[0];
}

export function getTcgPlayerMarketPrice(
  prices?: TCGPlayer["prices"] | null,
): number | undefined {
  return getFirstTcgPlayerMarketEntry(prices)?.price;
}

function readPositiveNumber(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * Cardmarket trend fields end with "Trend" (e.g. reverseHoloTrend).
 * Also include trendPrice as the standard non-suffix trend field.
 */
export function formatCardmarketTrendLabel(fieldKey: string): string {
  // Empty label — card face reserves a blank line for consistent spacing
  if (fieldKey === "trendPrice") return "";

  const withoutTrend = fieldKey.endsWith("Trend")
    ? fieldKey.slice(0, -"Trend".length)
    : fieldKey;

  if (!withoutTrend) return "Trend";

  return withoutTrend
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

/**
 * Every Cardmarket trend price (keys ending in "Trend", plus trendPrice).
 */
export function listCardmarketTrendEntries(
  prices?: CardMarket["prices"] | null,
): { key: string; price: number; label: string }[] {
  if (!prices || typeof prices !== "object") return [];

  const entries: { key: string; price: number; label: string }[] = [];
  const seen = new Set<string>();

  const push = (key: string) => {
    if (seen.has(key)) return;
    const price = readPositiveNumber((prices as Record<string, unknown>)[key]);
    if (price == null) return;
    seen.add(key);
    entries.push({
      key,
      price,
      label: formatCardmarketTrendLabel(key),
    });
  };

  // Standard first, then known reverse-holo trend, then any other *Trend keys
  push("trendPrice");
  push("reverseHoloTrend");

  for (const key of Object.keys(prices)) {
    if (key.endsWith("Trend")) push(key);
  }

  return entries;
}

/** Combined TCG market + Cardmarket trend options for the Source picker. */
export function listCardPriceOptions(card: {
  tcgplayer?: TCGPlayer | null;
  cardmarket?: CardMarket | null;
}): CardPriceOption[] {
  const options: CardPriceOption[] = [];

  for (const entry of listTcgPlayerMarketEntries(card.tcgplayer?.prices)) {
    options.push({
      id: `tcgplayer:${entry.variant}`,
      source: "tcgplayer",
      key: entry.variant,
      label: formatTcgPlayerVariantLabel(entry.variant) ?? entry.variant,
      price: entry.price,
      currencySymbol: "$",
    });
  }

  for (const entry of listCardmarketTrendEntries(card.cardmarket?.prices)) {
    options.push({
      id: `cardmarket:${entry.key}`,
      source: "cardmarket",
      key: entry.key,
      label: entry.label,
      price: entry.price,
      currencySymbol: "€",
    });
  }

  return options;
}

export function getCardPriceSourceLabel(source: CardPriceSource): string {
  return source === "tcgplayer" ? "TCG" : "Cardmarket";
}

export function pickDefaultCardPriceOption(
  options: CardPriceOption[],
  preferredSource: CardPriceSource = "tcgplayer",
): CardPriceOption | undefined {
  return (
    options.find((option) => option.source === preferredSource) ?? options[0]
  );
}

/** Selected option id → price option, else default for the card. */
export function resolveCardPriceOption(
  card: {
    tcgplayer?: TCGPlayer | null;
    cardmarket?: CardMarket | null;
  },
  selectedOptionId?: string | null,
  preferredSource: CardPriceSource = "tcgplayer",
): CardPriceOption | undefined {
  const options = listCardPriceOptions(card);
  if (selectedOptionId) {
    const selected = options.find((option) => option.id === selectedOptionId);
    if (selected) return selected;
  }
  return pickDefaultCardPriceOption(options, preferredSource);
}

export function getHistoricalPriceForOption(
  option: Pick<CardPriceOption, "key" | "source">,
  snapshot: {
    tcgplayerPrices?: Partial<TCGPlayer["prices"]> | null;
    cardmarketPrices?: Partial<CardMarket["prices"]> | null;
  },
): number | undefined {
  if (option.source === "tcgplayer") {
    const prices = snapshot.tcgplayerPrices as
      Record<string, unknown> | null | undefined;
    return readPositiveMarket(prices?.[option.key]);
  }

  const prices = snapshot.cardmarketPrices as
    Record<string, unknown> | null | undefined;
  return readPositiveNumber(prices?.[option.key]);
}
