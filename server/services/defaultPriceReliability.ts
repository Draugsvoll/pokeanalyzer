import { assessCardmarketPriceReliability } from "./cardmarketPriceReliability.js";
import { assessTcgPriceReliability } from "./tcgPriceReliability.js";
import { getOrderedTcgPlayerVariantKeys } from "../../shared/tcgPlayerVariants.js";

type JsonObject = Record<string, unknown>;

export type DefaultPriceReliability = {
  tcgplayer: { isFlagged: boolean };
  cardmarket: { isFlagged: boolean };
};

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function getDefaultTcgVariant(prices: JsonObject) {
  for (const key of getOrderedTcgPlayerVariantKeys(prices)) {
    const variant = asObject(prices[key]);
    if (variant && positiveNumber(variant.market) !== null) return variant;
  }

  return null;
}

function getDefaultCardmarketTrend(prices: JsonObject) {
  const keys = [
    "trendPrice",
    "reverseHoloTrend",
    ...Object.keys(prices).filter(
      (key) => key.endsWith("Trend") && key !== "reverseHoloTrend",
    ),
  ];

  for (const key of keys) {
    const trendPrice = positiveNumber(prices[key]);
    if (trendPrice === null) continue;

    const prefix = key === "trendPrice" ? "" : key.slice(0, -"Trend".length);
    return {
      key,
      trendPrice,
      averageSellPrice: positiveNumber(
        prices[prefix ? `${prefix}Sell` : "averageSellPrice"],
      ),
      avg7: positiveNumber(prices[prefix ? `${prefix}Avg7` : "avg7"]),
      avg30: positiveNumber(prices[prefix ? `${prefix}Avg30` : "avg30"]),
      lowPrice: positiveNumber(prices[prefix ? `${prefix}Low` : "lowPrice"]),
    };
  }

  return null;
}

export function assessDefaultCardPrices(
  card: JsonObject,
  previousCardmarketPrices?: JsonObject | null,
): DefaultPriceReliability {
  const tcgPrices = asObject(asObject(card.tcgplayer)?.prices);
  const tcgVariant = tcgPrices ? getDefaultTcgVariant(tcgPrices) : null;
  const tcgMarket = positiveNumber(tcgVariant?.market);
  const tcgplayer =
    tcgVariant && tcgMarket !== null
      ? assessTcgPriceReliability({
          market: tcgMarket,
          low: positiveNumber(tcgVariant.low),
          mid: positiveNumber(tcgVariant.mid),
          high: positiveNumber(tcgVariant.high),
        })
      : { isFlagged: false };

  const cardmarketPrices = asObject(asObject(card.cardmarket)?.prices);
  const cardmarketTrend = cardmarketPrices
    ? getDefaultCardmarketTrend(cardmarketPrices)
    : null;
  const cardmarket = cardmarketTrend
    ? assessCardmarketPriceReliability({
        trendPrice: cardmarketTrend.trendPrice,
        averageSellPrice: cardmarketTrend.averageSellPrice,
        avg7: cardmarketTrend.avg7,
        avg30: cardmarketTrend.avg30,
        lowPrice: cardmarketTrend.lowPrice,
        previousTrendPrice: positiveNumber(
          previousCardmarketPrices?.[cardmarketTrend.key],
        ),
      })
    : { isFlagged: false };

  return {
    tcgplayer: { isFlagged: tcgplayer.isFlagged },
    cardmarket: { isFlagged: cardmarket.isFlagged },
  };
}
