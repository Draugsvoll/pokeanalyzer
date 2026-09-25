import type { PokemonCard } from "../types/pokemon";
import type { PokeTraceRawCondition } from "../../shared/pokeTraceMarketConditions";

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
