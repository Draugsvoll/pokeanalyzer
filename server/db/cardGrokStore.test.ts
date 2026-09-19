import assert from "node:assert/strict";
import test from "node:test";
import { isValidStoredFeatureResponse } from "./cardGrokStore.js";

const marketAnalysisResponse = {
  set_name: "Base Set",
  variant_name: "Unlimited Holofoil",
  score: 63,
  headline: "Prices and sales activity are broadly stable.",
  market_balance: {
    label: "balanced",
    explanation: "Supply and demand are broadly matched.",
  },
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
  healthiest_segment: {
    label: "PSA 9",
    explanation: "Recent sales and listings support steady activity.",
  },
  price_discovery: {
    label: "strong",
    explanation: "Recent transactions establish a consistent price range.",
  },
  eyes_on: {
    label: "Raw supply",
    explanation: "An increase in raw listings could affect realized prices.",
  },
};

const collectorAnalysisResponse = {
  analyses: [
    {
      variant_name: "Unlimited Holofoil",
      totalScore: "75",
      verdict: "A familiar collectible with broad demand.",
      overview: "This print has a longstanding place in collections.",
      categories: [
        "Rarity & Scarcity",
        "Collectors Demand",
        "Significance",
        "Artwork & Aesthetics",
        "Long-Term Collectibility",
      ].map((name) => ({
        name,
        score: "75",
        text: "Strong collector interest.",
      })),
      finalNote: ["Collectors value this print for its history."],
    },
  ],
};

const worthGradingResponse = {
  variants: [
    {
      card: {
        name: "Charizard",
        set: "Base Set",
        number: "4/102",
        variant_name: "Unlimited Holofoil",
      },
      attractiveness_level: {
        score: "72",
        reasoning: ["Collector demand supports grading interest."],
      },
      raw_sale_today: {
        gross_sale_usd: 200,
        estimated_fees_usd: 25,
        net_proceeds_usd: 175,
        time_to_sell: "Two to four weeks",
      },
      graded_scenarios: [
        {
          grade: "PSA 9",
          expected_sale_price_usd: 500,
          grading_tier: "Value",
          grading_tier_justification: "Standard tier",
          psa_grading_fee_usd: 25,
          shipping_and_insurance_usd: 20,
          ebay_fees_usd: 65,
          ebay_fee_model: "Standard fee",
          roi_vs_raw_net_percent: 122.9,
          net_profit_vs_raw_usd: 215,
          turnaround_time: "45 business days",
          psa_note: null,
        },
      ],
      psa_population: { psa_population_total: null },
      potential: "high",
      headline: "Strong grading potential for clean copies.",
      bottom_line: "Consider grading clean copies.",
      risk_profile: {
        label: "average",
        explanation: "Condition uncertainty affects the outcome.",
      },
    },
  ],
};

test("stored feature validation accepts each current response shape", () => {
  assert.equal(
    isValidStoredFeatureResponse(
      "collectors_analysis",
      collectorAnalysisResponse,
    ),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("collectors_analysis", {
      analyses: [
        {
          ...collectorAnalysisResponse.analyses[0],
          totalScore: "1",
          categories: [
            { name: "Custom category", score: "1", text: "Usable content." },
          ],
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
      score: 1,
      market_balance: {
        ...marketAnalysisResponse.market_balance,
        label: "seller_favored",
      },
      outlook: {
        ...marketAnalysisResponse.outlook,
        near_term: {
          ...marketAnalysisResponse.outlook.near_term,
          label: "very negative",
        },
      },
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("market_analysis", {
      ...marketAnalysisResponse,
      eyes_on: null,
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("market_analysis", {
      score: 63,
      headline: "Prices and sales activity are broadly stable.",
      market_signals: {
        demand: {
          score: 61,
          explanation: "Recent sales show steady buyer interest.",
        },
      },
      price_discovery: {
        label: "volatile",
        explanation: "A clear range has not formed yet.",
      },
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("worth_grading", worthGradingResponse),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("worth_grading", {
      variants: [
        {
          ...worthGradingResponse.variants[0],
          raw_sale_today: {
            ...worthGradingResponse.variants[0].raw_sale_today,
            time_to_sell: null,
          },
          graded_scenarios: [
            {
              ...worthGradingResponse.variants[0].graded_scenarios[0],
              grading_tier: null,
              grading_tier_justification: null,
              ebay_fee_model: null,
              turnaround_time: null,
            },
          ],
        },
      ],
    }),
    true,
  );
  for (const psaPopulation of [undefined, null, {}, "unavailable"]) {
    assert.equal(
      isValidStoredFeatureResponse("worth_grading", {
        variants: [
          {
            ...worthGradingResponse.variants[0],
            attractiveness_level: {
              score: "1",
              reasoning: ["A valid explanation."],
            },
            potential: "mixed",
            risk_profile: { label: "variable", explanation: "It depends." },
            psa_population: psaPopulation,
          },
        ],
      }),
      true,
    );
  }
});

test("stored feature validation rejects missing or empty analysis content", () => {
  for (const [storageKey, value] of [
    ["collectors_analysis", { analyses: [] }],
    [
      "collectors_analysis",
      {
        analyses: [
          {
            ...collectorAnalysisResponse.analyses[0],
            finalNote: "Old string note",
          },
        ],
      },
    ],
    [
      "market_analysis",
      {
        ...marketAnalysisResponse,
        market_signals: {
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
      "market_analysis",
      {
        ...marketAnalysisResponse,
        score: "63",
      },
    ],
    [
      "collectors_analysis",
      { analyses: [{ variant_name: "Unlimited", categories: [{}] }] },
    ],
    ["worth_grading", { variants: [] }],
    [
      "collectors_analysis",
      {
        analyses: [
          { ...collectorAnalysisResponse.analyses[0], totalScore: "0" },
        ],
      },
    ],
    [
      "collectors_analysis",
      {
        analyses: [
          {
            ...collectorAnalysisResponse.analyses[0],
            categories: [{ name: "Custom", score: "101", text: "Reason." }],
          },
        ],
      },
    ],
    ["market_analysis", { ...marketAnalysisResponse, score: 0 }],
    [
      "market_analysis",
      {
        ...marketAnalysisResponse,
        market_signals: {
          demand: { score: 63.5, explanation: "Half point." },
        },
      },
    ],
    ["market_analysis", { ...marketAnalysisResponse, headline: undefined }],
    ["market_analysis", { ...marketAnalysisResponse, market_signals: {} }],
    [
      "worth_grading",
      {
        variants: [
          {
            ...worthGradingResponse.variants[0],
            attractiveness_level: { score: "0", reasoning: ["Reason."] },
          },
        ],
      },
    ],
    [
      "worth_grading",
      {
        variants: [
          {
            ...worthGradingResponse.variants[0],
            attractiveness_level: { score: "65.5", reasoning: ["Reason."] },
          },
        ],
      },
    ],
    ["worth_grading", { variants: [{ card: {} }] }],
    [
      "worth_grading",
      {
        variants: [
          {
            ...worthGradingResponse.variants[0],
            raw_sale_today: {
              ...worthGradingResponse.variants[0].raw_sale_today,
              net_proceeds_usd: "175",
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
            ...worthGradingResponse.variants[0],
            risk_profile: undefined,
            recommendation: { bottom_line: "Legacy field" },
          },
        ],
      },
    ],
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
