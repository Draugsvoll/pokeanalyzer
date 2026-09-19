import type { PokeTraceSavedResponses } from "../../shared/pokeTraceSavedResponses.js";
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
  const prices = record(raw.prices) ?? {};
  const updatedAt = text(raw.lastUpdated) ?? "";
  const parsedMarketComparisons =
    parsePokeTraceMarketComparisons(marketComparisons);

  return {
    id: text(raw.id)!,
    name: text(raw.name)!,
    number: text(raw.cardNumber),
    rarity: text(raw.rarity),
    images: { small: image, large: image },
    set: {
      id: text(set?.slug) ?? text(set?.name) ?? "",
      name: text(set?.name) ?? "Unknown set",
    },
    pokeTrace: {
      currency: text(raw.currency) ?? "USD",
      marketplaceUrls: urls ?? {},
      prices,
      variant: text(raw.variant),
      variants,
      lastUpdated: updatedAt,
      ...(parsedMarketComparisons && {
        marketComparisons: parsedMarketComparisons,
      }),
    },
    grok: savedResponses.grok ?? {},
  };
}
