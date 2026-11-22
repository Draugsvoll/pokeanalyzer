import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKET_SUMMARY_GROK_OPTIONS,
  isMarketSummaryFresh,
  parseMarketSummaryResponse,
} from "./marketSummaryGeneration.js";

test("defines Grok settings specifically for market summaries", () => {
  assert.deepEqual(MARKET_SUMMARY_GROK_OPTIONS, {
    model: "grok-4.7",
    reasoningEffort: "xhigh",
    useCodeInterpreter: false,
  });
});

test("treats only market summaries younger than 13 days as fresh", () => {
  const now = Date.parse("2026-10-14T12:00:00.000Z");

  assert.equal(isMarketSummaryFresh("2026-10-01T12:00:00.001Z", now), true);
  assert.equal(isMarketSummaryFresh("2026-10-01T12:00:00.000Z", now), false);
  assert.equal(isMarketSummaryFresh("invalid", now), false);
});

test("parses the current Grok schema and supplies the server timestamp", () => {
  const result = parseMarketSummaryResponse(
    JSON.stringify({
      market_score: 58,
      market_score_explanation: ["Indexes eased, with selective vintage strength."],
      market_tone: {
        headline: "Demand varied by segment",
        label: "mixed",
      },
      key_themes_and_changes: [
        {
          title: "Modern sealed products",
          label: "neutral",
          theme: "Recent products traded steadily.",
        },
        null,
      ],
      market_drivers: null,
      segment_summary: [
        {
          vintage: {
            trend: "rising",
            description: "Older cards outperformed.",
          },
          modern: {
            trend: "softening",
            description: "Chase cards eased.",
          },
          graded: null,
          sealed: {
            trend: "mixed",
            description: "Boxes settled above MSRP.",
          },
        },
      ],
      collector_outlook: {
        label: "neutral",
        outlook: "Collectors could still buy and sell normally.",
      },
      what_to_watch: null,
    }),
    "2026-09-30T10:00:00.000Z",
  );

  assert.equal(result.generatedAt, "2026-09-30T10:00:00.000Z");
  assert.equal(result.marketScore, 58);
  assert.equal(result.marketTone?.label, "mixed");
  assert.equal(result.keyThemesAndChanges.length, 1);
  assert.deepEqual(result.marketDrivers, []);
  assert.deepEqual(
    result.segmentSummary.map((item) => item.key),
    ["vintage", "modern", "sealed"],
  );
  assert.deepEqual(result.whatToWatch, []);
});

test("keeps a valid market_score and drops invalid values", () => {
  const explanation = ["The score reflects mixed weekly conditions."];
  assert.equal(
    parseMarketSummaryResponse(
      JSON.stringify({
        market_score: 81,
        market_score_explanation: explanation,
        market_tone: { headline: "Markets held up", label: "positive" },
      }),
      "2026-09-30T10:00:00.000Z",
    ).marketScore,
    81,
  );
  assert.equal(
    parseMarketSummaryResponse(
      JSON.stringify({
        market_score: null,
        market_score_explanation: explanation,
        market_tone: { headline: "Markets held up", label: "positive" },
      }),
      "2026-09-30T10:00:00.000Z",
    ).marketScore,
    null,
  );
  assert.equal(
    parseMarketSummaryResponse(
      JSON.stringify({
        market_score: 140,
        market_score_explanation: explanation,
        market_tone: { headline: "Markets held up", label: "positive" },
      }),
      "2026-09-30T10:00:00.000Z",
    ).marketScore,
    null,
  );
  assert.equal(
    parseMarketSummaryResponse(
      JSON.stringify({
        market_score: "77",
        market_score_explanation: explanation,
        market_tone: { headline: "Markets held up", label: "positive" },
      }),
      "2026-09-30T10:00:00.000Z",
    ).marketScore,
    null,
  );
});

test("rejects old and empty market summaries", () => {
  assert.throws(
    () => parseMarketSummaryResponse('{"market_overview":null}'),
    /did not match the current schema/,
  );
  assert.throws(
    () =>
      parseMarketSummaryResponse(
        JSON.stringify({
          market_overview: ["This field is not rendered."],
          liquidity: [],
          market_tone: { headline: "Demand varied", label: "mixed" },
        }),
      ),
    /did not match the current schema/,
  );
  assert.throws(
    () =>
      parseMarketSummaryResponse(
        JSON.stringify({
          market_score_explanation: ["Explanation"],
          segment_summary: [
            {
              title: "Vintage",
              trend: "rising",
              description: "Older cards outperformed.",
            },
          ],
        }),
      ),
    /did not match the current schema/,
  );
});
