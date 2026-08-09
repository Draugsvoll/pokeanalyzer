import type { CardMarket, JustTcg, TCGPlayer } from "../types/pokemon/pricing";
import {
  getOrderedTcgPlayerVariantKeys,
  TCG_PLAYER_VARIANT_ORDER,
  type TcgPlayerVariantKey,
} from "../../shared/tcgPlayerVariants";

export { TCG_PLAYER_VARIANT_ORDER };

export type TCGPlayerVariantKey = TcgPlayerVariantKey;

export type CardPriceSource = "tcgplayer" | "cardmarket" | "justtcg";

export type CardPriceOption = {
  id: string;
  source: CardPriceSource;
  /** Raw key (TCG variant or Cardmarket field name) */
  key: string;
  groupKey?: string;
  conditionLabel?: string;
  conditionShortLabel?: string;
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
    unlimited: "Unlimited",
    unlimitedHolofoil: "Unlimited Holofoil",
    reverseHolofoil: "Reverse Holo",
    "1stEdition": "1st Edition",
    "1stEditionHolofoil": "1st Edition Holofoil",
    firstEditionHolofoil: "1st Edition Holofoil",
    firstEditionNormal: "1st Edition Normal",
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
  const priceRecord = prices as Record<string, unknown>;

  for (const key of getOrderedTcgPlayerVariantKeys(priceRecord)) {
    const price = readPositiveMarket(priceRecord[key]);
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

function formatJustTcgVariantLabel({
  printing,
  setName,
}: {
  printing: string;
  setName?: string;
}) {
  const identity = [setName].filter(Boolean).join(" · ");
  return [printing, identity].filter(Boolean).join(" · ");
}

function formatJustTcgConditionLabel(condition: string) {
  if (/^near mint$|^nm$/i.test(condition)) return "Near Mint";
  if (/^lightly played$|^lp$/i.test(condition)) return "Lightly Played";
  return condition;
}

function formatJustTcgConditionShortLabel(condition: string) {
  if (/^near mint$|^nm$/i.test(condition)) return "NM";
  if (/^lightly played$|^lp$/i.test(condition)) return "LP";
  return condition;
}

export function listJustTcgMarketEntries(
  prices?: JustTcg["prices"] | null,
): {
  conditionLabel: string;
  conditionShortLabel: string;
  groupKey: string;
  key: string;
  price: number;
  label: string;
}[] {
  if (!prices || typeof prices !== "object") return [];

  const isSupportedCondition = (condition: string) =>
    /^near mint$|^nm$|^lightly played$|^lp$/i.test(condition);
  const conditionOrder = (condition: string) => {
    if (/^near mint$|^nm$/i.test(condition)) return 0;
    if (/^lightly played$|^lp$/i.test(condition)) return 1;
    return 2;
  };

  return Object.entries(prices)
    .map(([key, value]) => ({
      condition: value.condition,
      conditionLabel: formatJustTcgConditionLabel(value.condition),
      conditionShortLabel: formatJustTcgConditionShortLabel(value.condition),
      groupKey: [value.printing, value.setName ?? ""].join("|"),
      key,
      label: formatJustTcgVariantLabel(value),
      price: readPositiveNumber(value.market),
      printing: value.printing,
      setName: value.setName ?? "",
    }))
    .filter(
      (
        entry,
      ): entry is {
        condition: string;
        conditionLabel: string;
        conditionShortLabel: string;
        groupKey: string;
        key: string;
        price: number;
        label: string;
        printing: string;
        setName: string;
      } => entry.price !== undefined,
    )
    .filter((entry) => isSupportedCondition(entry.condition))
    .sort((first, second) => {
      const printingDifference = first.printing.localeCompare(second.printing);
      if (printingDifference !== 0) return printingDifference;

      const setDifference = first.setName.localeCompare(second.setName);
      if (setDifference !== 0) return setDifference;

      const conditionDifference =
        conditionOrder(first.condition) - conditionOrder(second.condition);
      if (conditionDifference !== 0) return conditionDifference;

      return first.condition.localeCompare(second.condition);
    });
}

/** Combined TCG market + Cardmarket trend options for the Source picker. */
export function listCardPriceOptions(card: {
  tcgplayer?: TCGPlayer | null;
  cardmarket?: CardMarket | null;
  justtcg?: JustTcg | null;
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

  for (const entry of listJustTcgMarketEntries(card.justtcg?.prices)) {
    options.push({
      id: `justtcg:${entry.key}`,
      source: "justtcg",
      key: entry.key,
      groupKey: entry.groupKey,
      conditionLabel: entry.conditionLabel,
      conditionShortLabel: entry.conditionShortLabel,
      label: entry.label,
      price: entry.price,
      currencySymbol: "$",
    });
  }

  return options;
}

export function getCardPriceSourceLabel(source: CardPriceSource): string {
  if (source === "tcgplayer") return "TCG";
  if (source === "cardmarket") return "Cardmarket";
  return "JustTCG";
}

export function pickDefaultCardPriceOption(
  options: CardPriceOption[],
  preferredSource: CardPriceSource = "tcgplayer",
): CardPriceOption | undefined {
  return (
    options.find((option) => option.source === preferredSource) ?? options[0]
  );
}

export function getDefaultCardPriceOptionForSource(
  card: {
    tcgplayer?: TCGPlayer | null;
    cardmarket?: CardMarket | null;
    justtcg?: JustTcg | null;
  },
  source: CardPriceSource,
): CardPriceOption | undefined {
  return listCardPriceOptions(card).find((option) => option.source === source);
}

export function getCardPriceOptionForSourceKey(
  card: {
    tcgplayer?: TCGPlayer | null;
    cardmarket?: CardMarket | null;
    justtcg?: JustTcg | null;
  },
  source: CardPriceSource,
  key?: string | null,
): CardPriceOption | undefined {
  const options = listCardPriceOptions(card).filter(
    (option) => option.source === source,
  );
  return options.find((option) => option.key === key) ?? options[0];
}

/** Selected option id → price option, else default for the card. */
export function resolveCardPriceOption(
  card: {
    tcgplayer?: TCGPlayer | null;
    cardmarket?: CardMarket | null;
    justtcg?: JustTcg | null;
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

export function getDirectPriceChangeForOption(
  card: {
    justtcg?: JustTcg | null;
  },
  option: Pick<CardPriceOption, "key" | "source"> | undefined,
  period: "24h" | "7d" | "30d",
): number | undefined {
  if (!option || option.source !== "justtcg") return undefined;

  const priceData = card.justtcg?.prices?.[option.key];
  if (!priceData) return undefined;

  if (period === "24h") return priceData.percentChange24h;
  if (period === "7d") return priceData.percentChange7d;
  return priceData.percentChange30d;
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

  if (option.source === "cardmarket") {
    const prices = snapshot.cardmarketPrices as
      Record<string, unknown> | null | undefined;
    return readPositiveNumber(prices?.[option.key]);
  }

  return undefined;
}
