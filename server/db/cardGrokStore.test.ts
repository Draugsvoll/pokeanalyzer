import assert from "node:assert/strict";
import test from "node:test";
import { isValidStoredFeatureResponse } from "./cardGrokStore.js";

const marketAnalysisResponse = {
  score: 63,
  explanation: "Steady demand and liquidity support a functional market.",
  headline: "Prices and sales activity are broadly stable.",
  evidence_quality: {
    score: 72,
    reason: "Several recent sales were available.",
  },
  market_balance: "balanced",
  market_signals: {
    demand: {
      score: 61,
      explanation: "Recent sales show steady buyer interest.",
    },
    liquidity: {
      score: 74,
      explanation: "Listings turn over regularly.",
    },
    momentum: {
      score: 55,
      explanation: "Prices have remained broadly stable.",
    },
    stability: {
      score: 42,
      explanation: "Sale prices remain within a consistent range.",
    },
  },
  outlook: {
    long_term: {
      label: "positive",
      explanation: "Established demand supports the longer term.",
    },
    near_term: {
      label: "stable",
      explanation: "Recent activity points to stable conditions.",
    },
    risks: ["A rapid increase in supply could pressure prices."],
    upside_drivers: ["Consistent collector demand."],
  },
  strongest_segment: "PSA 9",
};

test("stored feature validation accepts each current response shape", () => {
  assert.equal(
    isValidStoredFeatureResponse("collectors_analysis", {
      analyses: [
        {
          variant_name: "Unlimited",
          categories: [{ name: "Collector demand", score: "75" }],
        },
      ],
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("market_analysis", marketAnalysisResponse),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("market_analysis", {
      ...marketAnalysisResponse,
      score: "63",
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("worth_grading", {
      variants: [{ card: {} }],
    }),
    true,
  );
});

test("stored feature validation rejects missing or empty analysis content", () => {
  for (const [storageKey, value] of [
    ["collectors_analysis", { analyses: [] }],
    [
      "market_analysis",
      {
        ...marketAnalysisResponse,
        market_balance: "unknown",
      },
    ],
    [
      "market_analysis",
      {
        ...marketAnalysisResponse,
        market_signals: {
          ...marketAnalysisResponse.market_signals,
          demand: "61",
        },
      },
    ],
    [
      "market_analysis",
      {
        ...marketAnalysisResponse,
        score: "0",
      },
    ],
    [
      "collectors_analysis",
      { analyses: [{ variant_name: "Unlimited", categories: [{}] }] },
    ],
    ["worth_grading", { variants: [] }],
    ["worth_grading", { variants: [{}] }],
    ["worth_grading", { variants: [{ unrelated: true }] }],
    ["worth_grading", { variants: [null] }],
    ["worth_grading", { variants: ["Unlimited"] }],
    ["unknown", { variants: [{}] }],
  ] as const) {
    assert.equal(isValidStoredFeatureResponse(storageKey, value), false);
  }
});

test("stored eBay validation requires both item arrays but allows zero results", () => {
  assert.equal(
    isValidStoredFeatureResponse("ebay_sold", {
      active: { items: [] },
      sold: { items: [] },
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("ebay_sold", {
      active: {},
      sold: { items: [] },
    }),
    false,
  );
});
