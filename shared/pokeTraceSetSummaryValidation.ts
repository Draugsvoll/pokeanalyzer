import type { PokeTraceSetSummary } from "./pokeTraceSetSummaries.js";

export function normalizePokeTraceSetSummary(
  value: unknown,
): PokeTraceSetSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary = value as Partial<PokeTraceSetSummary>;
  const { comparableCards, pricedCards, uniqueCards } = summary;
  if (
    typeof summary.asOf !== "string" ||
    !Number.isFinite(Date.parse(summary.asOf)) ||
    typeof summary.currency !== "string" ||
    !summary.currency.trim() ||
    typeof summary.setName !== "string" ||
    !summary.setName.trim() ||
    typeof uniqueCards !== "number" ||
    !Number.isSafeInteger(uniqueCards) ||
    uniqueCards < 1 ||
    typeof pricedCards !== "number" ||
    !Number.isSafeInteger(pricedCards) ||
    pricedCards < 0 ||
    pricedCards > uniqueCards ||
    typeof comparableCards !== "number" ||
    !Number.isSafeInteger(comparableCards) ||
    comparableCards < 0 ||
    comparableCards > pricedCards ||
    (summary.sevenDayChangePercent !== null &&
      (typeof summary.sevenDayChangePercent !== "number" ||
        !Number.isFinite(summary.sevenDayChangePercent)))
  )
    return null;
  return {
    asOf: summary.asOf,
    comparableCards,
    currency: summary.currency.trim(),
    pricedCards,
    setName: summary.setName.trim(),
    sevenDayChangePercent: summary.sevenDayChangePercent,
    uniqueCards,
  };
}
