import assert from "node:assert/strict";
import test from "node:test";
import { isValidStoredFeatureResponse } from "./cardGrokStore.js";

const marketAnalysisResponse = {
  card: {
    name: "Pikachu",
    number: "58/102",
    set: "Base Set",
    variant: "Unlimited",
  },
  evidence_quality: {
    confidence: "moderate",
    reason: "Several recent sales were available.",
  },
  market_balance: {
    reason: "Available supply and buyer activity are balanced.",
    state: "balanced",
  },
  market_pulse: "Buyers remain active at established price levels.",
  market_sentiment: {
    label: "neutral",
    score: "63",
    summary: "Prices and sales activity are broadly stable.",
  },
  market_signals: {
    demand: {
      label: "moderate",
      reasoning: "Recent sales show steady buyer interest.",
    },
    liquidity: {
      label: "high",
      reasoning: "Listings turn over regularly.",
    },
    momentum: {
      label: "moderate",
      reasoning: "Prices have remained broadly stable.",
    },
    volatility: {
      label: "moderate",
      reasoning: "Sale prices remain within a consistent range.",
    },
  },
  outlook: {
    long_term: "constructive",
    near_term: "stable",
    risks: ["A rapid increase in supply could pressure prices."],
    summary: "The market appears stable with balanced longer-term support.",
    upside_drivers: ["Consistent collector demand."],
  },
  strongest_segment: {
    label: "PSA 9",
    reason: "It has the healthiest balance of price and sale frequency.",
  },
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
      market_sentiment: {
        ...marketAnalysisResponse.market_sentiment,
        score: 63,
      },
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("worth_grading", {
      variants: [
        {
          card: {},
          graded_scenarios: [
            {
              grade: "PSA 7",
              net_profit_vs_raw_usd: 0,
            },
          ],
          attractiveness_level: {
            reasoning: ["The card has a practical grading opportunity."],
            score: "65",
          },
          recommendation: {
            bottom_line: "Grade only clean copies.",
            headline: "Grading offers meaningful upside.",
            potential: "good",
          },
        },
      ],
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
        market_sentiment: {
          ...marketAnalysisResponse.market_sentiment,
          label: "unknown",
        },
      },
    ],
    [
      "market_analysis",
      {
        ...marketAnalysisResponse,
        market_signals: {
          ...marketAnalysisResponse.market_signals,
          demand: "moderate",
        },
      },
    ],
    [
      "market_analysis",
      {
        ...marketAnalysisResponse,
        market_sentiment: {
          ...marketAnalysisResponse.market_sentiment,
          score: "0",
        },
      },
    ],
    [
      "collectors_analysis",
      { analyses: [{ variant_name: "Unlimited", categories: [{}] }] },
    ],
    ["worth_grading", { variants: [] }],
    [
      "worth_grading",
      {
        variants: [
          {
            card: {},
            graded_scenarios: [{ grade: "PSA 7", net_profit_vs_raw_usd: 100 }],
            recommendation: {
              bottom_line: "Grade only clean copies.",
              headline: "Grading offers meaningful upside.",
              potential: "good",
            },
          },
        ],
      },
    ],
    [
      "worth_grading",
      {
        variants: [
          {
            card: {},
            graded_scenarios: [{ grade: "PSA 7", net_profit_vs_raw_usd: 100 }],
            attractiveness_level: {
              reasoning: ["The card has a practical grading opportunity."],
              score: "65",
            },
            recommendation: {
              headline: "Grading offers meaningful upside.",
              potential: "good",
            },
          },
        ],
      },
    ],
    [
      "worth_grading",
      {
        variants: [
          {
            card: {},
            graded_scenarios: [{ grade: "PSA 7", net_profit_vs_raw_usd: 100 }],
            attractiveness_level: {
              reasoning: ["The card has a practical grading opportunity."],
              score: "high",
            },
            recommendation: {
              bottom_line: "Grade only clean copies.",
              headline: "Grading offers meaningful upside.",
              potential: "good",
            },
          },
        ],
      },
    ],
    [
      "worth_grading",
      {
        variants: [
          {
            card: {},
            graded_scenarios: [
              {
                grade: "PSA 7",
                grading_tier_justification: "Value tier was selected.",
              },
            ],
            recommendation: {
              headline: "Grading offers meaningful upside.",
              potential: "good",
            },
          },
        ],
      },
    ],
    [
      "worth_grading",
      {
        variants: [
          {
            card: {},
            graded_scenarios: [{ net_profit_vs_raw_usd: 100 }],
            recommendation: {
              headline: "Grading offers meaningful upside.",
              potential: "good",
            },
          },
        ],
      },
    ],
    [
      "worth_grading",
      {
        variants: [
          {
            card: {},
            graded_scenarios: [{ grading_tier: "Value" }],
            recommendation: {
              should_grade: true,
              summary: "Legacy recommendation",
            },
          },
        ],
      },
    ],
    [
      "worth_grading",
      {
        variants: [
          {
            card: {},
            graded_scenarios: [{ expected_sale_price_usd: null }],
            recommendation: {},
          },
        ],
      },
    ],
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
