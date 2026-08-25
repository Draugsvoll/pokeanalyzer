import assert from "node:assert/strict";
import test from "node:test";
import { isValidStoredFeatureResponse } from "./cardGrokStore.js";

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
    isValidStoredFeatureResponse("price_analysis", {
      market_data: [{ source: "PriceCharting" }],
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("sales_data", {
      variants: [
        {
          variant: "Unlimited Holofoil",
          market_prices: [{ grade: "Ungraded", price: null }],
        },
      ],
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("sell_price", {
      variants: [
        {
          variant: "Unlimited Holofoil",
          steps: [{ substeps: [{ label: "Near Mint", price: "$100" }] }],
        },
      ],
    }),
    true,
  );
  assert.equal(
    isValidStoredFeatureResponse("worth_grading", {
      variants: [
        {
          card: {},
          graded_scenarios: [
            { expected_sale_price_usd: null, grading_tier: "Value" },
          ],
          recommendation: {},
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
      "collectors_analysis",
      { analyses: [{ variant_name: "Unlimited", categories: [{}] }] },
    ],
    ["price_analysis", { market_data: [] }],
    ["price_analysis", { market_data: [{}] }],
    ["sales_data", { variants: [{ variant: "Unlimited", market_prices: [] }] }],
    [
      "sales_data",
      { variants: [{ variant: "Unlimited", market_prices: [{}] }] },
    ],
    ["sell_price", { variants: [{ variant: "Unlimited", steps: [] }] }],
    [
      "sell_price",
      { variants: [{ variant: "Unlimited", steps: [{ substeps: [] }] }] },
    ],
    ["worth_grading", { variants: [] }],
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
