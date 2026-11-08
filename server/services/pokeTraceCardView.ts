import { isTcgSnapshot } from "../../shared/tcgExplorer.js";
import type { PokeTraceSavedResponses } from "../../shared/pokeTraceSavedResponses.js";
import { isGradedHistoryTier } from "../../shared/pokeTraceHistoryTiers.js";
import { parsePokeTraceMarketComparisons } from "../../shared/pokeTraceMarketComparisons.js";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parsePokeTraceCard(rawJson: unknown) {
  const parsed =
    typeof rawJson === "string" ? (JSON.parse(rawJson) as unknown) : rawJson;
  const raw = record(parsed);
  if (!raw || !text(raw.id) || !text(raw.name)) {
    throw new Error("PokeTrace card contains invalid JSON");
  }
  return raw;
}

export function toPokemonCard(
  rawJson: unknown,
  savedResponses: PokeTraceSavedResponses = {},
  variants: Array<{ id: string; name: string }> = [],
  marketComparisons?: unknown,
) {
  const raw = parsePokeTraceCard(rawJson);
  const set = record(raw.set);
  const image = text(raw.image) ?? "";
  const urls = record(raw.marketplaceUrls);
  const marketPrices = record(raw.prices) ?? {};
  // Project the native v2 US prices into the existing price-card UI props.
  const prices: Record<string, Record<string, unknown>> = {};
  for (const [tier, markets] of Object.entries(marketPrices)) {
    for (const [source, price] of Object.entries(
      record(record(markets)?.US) ?? {},
    )) {
      if (record(price)) (prices[source] ??= {})[tier] = price;
    }
  }
  const updatedAt = text(raw.lastUpdated) ?? "";
  const parsedMarketComparisons =
    parsePokeTraceMarketComparisons(marketComparisons);
  const { ebay_sold: legacyEbay, ...grok } = savedResponses.grok ?? {};
  const ebay = record(savedResponses.ebay) ?? record(legacyEbay);

  return {
    id: text(raw.id)!,
    name: text(raw.name)!,
    number: text(raw.cardNumber),
    rarity: text(raw.rarity),
    image,
    set: {
      id: text(set?.slug) ?? text(set?.name) ?? "",
      name: text(set?.name) ?? "Unknown set",
    },
    pokeTrace: {
      currency: text(raw.currency) ?? "USD",
      marketplaceUrls: urls ?? {},
      prices,
      markets: raw.markets,
      marketPrices,
      ...(Array.isArray(raw.gradedOptions) && {
        gradedOptions: raw.gradedOptions.filter(isGradedHistoryTier),
      }),
      variant: text(raw.variant),
      variants,
      lastUpdated: updatedAt,
      ...(parsedMarketComparisons && {
        marketComparisons: parsedMarketComparisons,
      }),
    },
    grok,
    ...(ebay && { ebay }),
    ...(isTcgSnapshot(savedResponses.tcg_listings) && {
      tcg_listings: savedResponses.tcg_listings,
    }),
  };
}
