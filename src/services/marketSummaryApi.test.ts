import { afterEach, expect, test, vi } from "vitest";
import { fetchMarketSummary } from "./marketSummaryApi";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

test("returns a valid server market summary", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse({
        marketSummary: {
          generatedAt: "2026-11-21T12:00:00.000Z",
          marketScore: 58,
          marketScoreExplanation: ["Indexes eased over the week."],
          marketTone: {
            headline: "Modern chase softened while vintage gained.",
            label: "mixed",
          },
          keyThemesAndChanges: [],
          marketDrivers: [],
          segmentSummary: [],
          collectorOutlook: null,
          whatToWatch: [],
        },
      }),
    ),
  );

  const summary = await fetchMarketSummary();
  expect(summary?.marketScore).toBe(58);
  expect(summary?.marketScoreExplanation).toEqual([
    "Indexes eased over the week.",
  ]);
});

test("skips the report when the saved server report is invalid", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse({
        marketSummary: {
          generatedAt: "2026-09-30T12:00:00.000Z",
          marketScore: null,
          marketTone: { headline: "Old report", label: "mixed" },
          marketOverview: ["Legacy overview"],
          keyThemesAndChanges: [],
          liquidity: [],
          marketDrivers: [],
          segmentSummary: [],
          collectorOutlook: null,
          whatToWatch: [],
        },
      }),
    ),
  );

  expect(await fetchMarketSummary()).toBeNull();
});
