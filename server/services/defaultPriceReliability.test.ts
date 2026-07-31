import assert from "node:assert/strict";
import test from "node:test";
import { getOrderedTcgPlayerVariantKeys } from "../../shared/tcgPlayerVariants.js";
import { assessDefaultCardPrices } from "./defaultPriceReliability.js";

test("portfolio reliability evaluates the displayed default TCG variant only", () => {
  const reliability = assessDefaultCardPrices({
    tcgplayer: {
      prices: {
        normal: { low: 45, mid: 50, high: 60, market: 50 },
        reverseHolofoil: { low: 1, mid: 10, high: 500, market: 100 },
      },
    },
  });

  assert.deepEqual(reliability.tcgplayer, { isFlagged: false });
});

test("portfolio reliability applies the $25 minimum to displayed defaults", () => {
  const reliability = assessDefaultCardPrices({
    tcgplayer: {
      prices: {
        normal: { low: 0.01, mid: 1, high: 500, market: 24.99 },
      },
    },
    cardmarket: {
      prices: {
        trendPrice: 24.99,
        averageSellPrice: 1,
        avg7: 1,
        avg30: 1,
        lowPrice: 0.01,
      },
    },
  });

  assert.deepEqual(reliability, {
    tcgplayer: { isFlagged: false },
    cardmarket: { isFlagged: false },
  });
});

test("portfolio reliability flags unstable displayed defaults at $25 or more", () => {
  const reliability = assessDefaultCardPrices({
    tcgplayer: {
      prices: {
        holofoil: { low: 1, mid: 10, high: 500, market: 100 },
      },
    },
    cardmarket: {
      prices: {
        trendPrice: 100,
        averageSellPrice: 10,
        avg7: 10,
        avg30: 10,
        lowPrice: 1,
      },
    },
  });

  assert.deepEqual(reliability, {
    tcgplayer: { isFlagged: true },
    cardmarket: { isFlagged: true },
  });
});

test("Unlimited is the default when vintage prices also include 1st Edition", () => {
  const reliability = assessDefaultCardPrices({
    tcgplayer: {
      prices: {
        "1stEditionHolofoil": {
          low: 1,
          mid: 10,
          high: 500,
          market: 100,
        },
        unlimitedHolofoil: {
          low: 45,
          mid: 50,
          high: 60,
          market: 50,
        },
      },
    },
  });

  assert.deepEqual(reliability.tcgplayer, { isFlagged: false });
});

test("unknown TCG variants use a deterministic fallback order", () => {
  assert.deepEqual(
    getOrderedTcgPlayerVariantKeys({
      zetaVariant: {},
      alphaVariant: {},
    }).slice(-2),
    ["alphaVariant", "zetaVariant"],
  );
});
