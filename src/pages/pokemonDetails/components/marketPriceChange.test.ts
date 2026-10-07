import { describe, expect, test } from "vitest";
import type { CardPriceHistoryResponse } from "../../../services/cardApi";
import { resolveSevenDayMarketPriceChange } from "./marketPriceChange";

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
