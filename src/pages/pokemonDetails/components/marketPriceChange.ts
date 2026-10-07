import { calculateDisplayedPriceChangePercent } from "../../../../shared/pokeTracePriceChange";
import type { CardPriceHistoryResponse } from "../../../services/cardApi";

const DAY_MS = 24 * 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dateDaysBefore(date: string, days: number) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp - days * DAY_MS).toISOString().slice(0, 10);
}

function averagePrice(
  prices: Record<string, unknown>,
  source: string,
  condition: string,
) {
  const sourcePrices = record(prices[source]);
  const conditionPrice = record(sourcePrices?.[condition]);
  const average = conditionPrice?.avg;
  return typeof average === "number" && Number.isFinite(average)
    ? average
    : null;
}

export function resolveSevenDayMarketPriceChange(
  history: CardPriceHistoryResponse | null,
  source: string,
  condition: string,
  currentPrice: number | null | undefined,
) {
  const latestDate = history?.snapshots.at(-1)?.recordedAt;
  if (!history || !latestDate) return null;

  const candidateDates = [7, 8, 6]
    .map((days) => dateDaysBefore(latestDate, days))
    .filter((date): date is string => date !== null);
  const comparison = candidateDates
    .map((date) =>
      history.snapshots.find((snapshot) => snapshot.recordedAt === date),
    )
    .find((snapshot) => snapshot !== undefined);
  if (!comparison) return null;

  const comparisonPrice = averagePrice(comparison.prices, source, condition);
  const percent = calculateDisplayedPriceChangePercent(
    currentPrice,
    comparisonPrice,
  );
  return percent === null
    ? null
    : { percent, recordedAt: comparison.recordedAt };
}
