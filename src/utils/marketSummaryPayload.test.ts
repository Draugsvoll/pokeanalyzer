import { expect, test } from "vitest";
import { isMarketSummaryPayload } from "./marketSummaryPayload";

const minimalSummary = {
  generatedAt: "2026-10-01T12:00:00.000Z",
  marketTone: {
    headline: "The market was mixed",
    label: "mixed",
  },
  marketOverview: [],
  keyThemesAndChanges: [],
  liquidity: [],
  marketDrivers: [],
  segmentSummary: [],
  collectorOutlook: null,
  whatToWatch: [],
};

test("accepts the current market-summary shape with renderable content", () => {
  expect(isMarketSummaryPayload(minimalSummary)).toBe(true);
});

test("rejects empty and unsafe market-summary objects", () => {
  expect(isMarketSummaryPayload({})).toBe(false);
  expect(
    isMarketSummaryPayload({
      ...minimalSummary,
      keyThemesAndChanges: [null],
    }),
  ).toBe(false);
});

test("rejects summaries containing only the hidden market overview", () => {
  expect(
    isMarketSummaryPayload({
      ...minimalSummary,
      marketTone: null,
      marketOverview: ["This field is not rendered."],
    }),
  ).toBe(false);
});
