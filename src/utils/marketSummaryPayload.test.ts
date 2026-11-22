import { expect, test } from "vitest";
import {
  isMarketSummaryPayload,
  parseMarketSummaryPayload,
  parseMarketSummaryResponse,
} from "./marketSummaryPayload";

const minimalSummary = {
  generatedAt: "2026-10-01T12:00:00.000Z",
  marketScore: null,
  marketScoreExplanation: [],
  marketTone: {
    headline: "The market was mixed",
    label: "mixed",
  },
  keyThemesAndChanges: [],
  marketDrivers: [],
  segmentSummary: [],
  collectorOutlook: null,
  whatToWatch: [],
};

const grokSummary = {
  market_score: 58,
  market_score_explanation: [
    "Indexes eased over the week.",
    "Selective vintage strength kept the score from falling further.",
  ],
  market_tone: {
    label: "mixed",
    headline: "Modern chase softened while vintage gained.",
  },
  key_themes_and_changes: [
    {
      title: "Modern chase eased",
      label: "negative",
      theme: "Recent sets lost ground.",
    },
  ],
  market_drivers: [
    {
      title: "New set supply",
      description: "Fresh product continued to reach the market.",
    },
  ],
  segment_summary: [
    {
      vintage: { trend: "rising", description: "Older cards outperformed." },
      modern: { trend: "softening", description: "Chase cards eased." },
      graded: { trend: "mixed", description: "Results were card-specific." },
      sealed: { trend: "mixed", description: "Modern boxes settled." },
    },
  ],
  collector_outlook: {
    label: "neutral",
    outlook: "Conditions stayed usable across segments.",
  },
  what_to_watch: [
    {
      title: "Set legality",
      description: "Tournament legality may change demand.",
    },
  ],
};

test("accepts the current market-summary shape with renderable content", () => {
  expect(isMarketSummaryPayload(minimalSummary)).toBe(true);
});

test("parses the current Grok schema", () => {
  const parsed = parseMarketSummaryPayload(
    grokSummary,
    "2026-11-21T12:00:00.000Z",
  );
  expect(parsed?.generatedAt).toBe("2026-11-21T12:00:00.000Z");
  expect(parsed?.marketScore).toBe(58);
  expect(parsed?.marketScoreExplanation).toHaveLength(2);
  expect(parsed?.segmentSummary.map((item) => item.key)).toEqual([
    "vintage",
    "modern",
    "graded",
    "sealed",
  ]);
});

test("rejects empty, old, and unsafe market-summary objects", () => {
  expect(isMarketSummaryPayload({})).toBe(false);
  expect(
    isMarketSummaryPayload({
      ...minimalSummary,
      keyThemesAndChanges: [null],
    }),
  ).toBe(false);
  expect(
    isMarketSummaryPayload({
      generatedAt: "2026-10-01T12:00:00.000Z",
      marketScore: null,
      marketTone: {
        headline: "The market was mixed",
        label: "mixed",
      },
      marketOverview: ["This field is not rendered."],
      keyThemesAndChanges: [],
      liquidity: [],
      marketDrivers: [],
      segmentSummary: [],
      collectorOutlook: null,
      whatToWatch: [],
    }),
  ).toBe(false);
  expect(
    parseMarketSummaryPayload({
      ...grokSummary,
      segment_summary: [
        {
          title: "Vintage",
          trend: "rising",
          description: "Older cards outperformed.",
        },
      ],
    }),
  ).toBeNull();
});

test("accepts a valid market score and rejects invalid ones", () => {
  expect(isMarketSummaryPayload({ ...minimalSummary, marketScore: 64 })).toBe(
    true,
  );
  expect(isMarketSummaryPayload({ ...minimalSummary, marketScore: null })).toBe(
    true,
  );
  expect(isMarketSummaryPayload({ ...minimalSummary, marketScore: 0 })).toBe(
    false,
  );
  expect(isMarketSummaryPayload({ ...minimalSummary, marketScore: 101 })).toBe(
    false,
  );
  expect(
    isMarketSummaryPayload({ ...minimalSummary, marketScore: 72.5 }),
  ).toBe(false);
  expect(
    isMarketSummaryPayload({ ...minimalSummary, marketScore: "72" }),
  ).toBe(false);
  const { marketScore: _ignored, ...withoutMarketScore } = minimalSummary;
  expect(isMarketSummaryPayload(withoutMarketScore)).toBe(false);
});

test("parseMarketSummaryResponse throws for invalid JSON and schema", () => {
  expect(() => parseMarketSummaryResponse("{")).toThrow(/invalid JSON/);
  expect(() => parseMarketSummaryResponse('{"market_overview":null}')).toThrow(
    /did not match the current schema/,
  );
});
