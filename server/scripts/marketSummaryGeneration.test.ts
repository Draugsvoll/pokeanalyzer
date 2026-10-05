import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKET_SUMMARY_GROK_OPTIONS,
  isMarketSummaryFresh,
  parseMarketSummaryResponse,
} from "./marketSummaryGeneration.js";

test("defines Grok settings specifically for market summaries", () => {
  assert.deepEqual(MARKET_SUMMARY_GROK_OPTIONS, {
    model: "grok-4.5",
    reasoningEffort: "high",
    useCodeInterpreter: false,
  });
});

test("treats only market summaries younger than 14 days as fresh", () => {
  const now = Date.parse("2026-10-15T12:00:00.000Z");

  assert.equal(isMarketSummaryFresh("2026-10-01T12:00:00.001Z", now), true);
  assert.equal(isMarketSummaryFresh("2026-10-01T12:00:00.000Z", now), false);
  assert.equal(isMarketSummaryFresh("invalid", now), false);
});

test("normalizes a partial market summary and supplies the server timestamp", () => {
  const result = parseMarketSummaryResponse(
    JSON.stringify({
      market_tone: {
        headline: "Demand varied by segment",
        label: "mixed",
      },
      market_overview: ["Modern sets were stable.", null, ""],
      key_themes_and_changes: [
        {
          title: "Modern sealed products",
          theme: "Recent products traded steadily.",
        },
        null,
      ],
      liquidity: null,
      what_to_watch: null,
    }),
    "2026-09-30T10:00:00.000Z",
  );

  assert.equal(result.generatedAt, "2026-09-30T10:00:00.000Z");
  assert.equal(result.marketTone?.label, "mixed");
  assert.deepEqual(result.marketOverview, ["Modern sets were stable."]);
  assert.equal(result.keyThemesAndChanges.length, 1);
  assert.deepEqual(result.liquidity, []);
  assert.deepEqual(result.whatToWatch, []);
});

test("rejects a market summary with no renderable content", () => {
  assert.throws(
    () => parseMarketSummaryResponse('{"market_overview":null}'),
    /did not contain any content/,
  );
  assert.throws(
    () =>
      parseMarketSummaryResponse(
        '{"market_overview":["This field is not rendered."]}',
      ),
    /did not contain any content/,
  );
});
