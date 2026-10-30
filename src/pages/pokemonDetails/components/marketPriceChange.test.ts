import { describe, expect, test } from "vitest";
import type { CardPriceHistoryResponse } from "../../../services/cardApi";
import {
  resolveEbaySevenDayAverageChange,
  resolveSevenDayMarketPriceChange,
} from "./marketPriceChange";

const history: CardPriceHistoryResponse = {
  cardId: "card-1",
  days: 9,
  snapshots: [
    {
      recordedAt: "2026-09-09",
      currency: "USD",
      prices: {
        tcgplayer: {
          NEAR_MINT: { avg: 100 },
          LIGHTLY_PLAYED: { avg: 80 },
        },
        ebay: { NEAR_MINT: { avg: 90 } },
      },
      sourceUpdatedAt: null,
    },
    {
      recordedAt: "2026-09-16",
      currency: "USD",
      prices: {
        tcgplayer: { NEAR_MINT: { avg: 110 } },
        ebay: { NEAR_MINT: { avg: 95 } },
      },
      sourceUpdatedAt: null,
    },
  ],
};

describe("resolveEbaySevenDayAverageChange", () => {
  test("compares the displayed price with the card 7-day average", () => {
    const currentPrice = 29.04;
    const average7d = 25.173334;
    expect(resolveEbaySevenDayAverageChange(currentPrice, average7d)).toEqual({
      percent: ((currentPrice - average7d) / average7d) * 100,
    });
  });

  test("returns null when the 7-day average is missing", () => {
    expect(resolveEbaySevenDayAverageChange(29.04, null)).toBeNull();
  });
});

describe("resolveSevenDayMarketPriceChange", () => {
  test("calculates the selected source and condition change", () => {
    expect(
      resolveSevenDayMarketPriceChange(
        history,
        "tcgplayer",
        "LIGHTLY_PLAYED",
        100,
      ),
    ).toEqual({ percent: 25, recordedAt: "2026-09-09" });
  });

  test("returns null when that source and condition has no comparison", () => {
    expect(
      resolveSevenDayMarketPriceChange(history, "ebay", "DAMAGED", 50),
    ).toBeNull();
  });
});
