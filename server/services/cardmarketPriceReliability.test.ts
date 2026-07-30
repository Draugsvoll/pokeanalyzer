import assert from "node:assert/strict";
import test from "node:test";
import { assessCardmarketPriceReliability } from "./cardmarketPriceReliability.js";

test("Cardmarket reliability keeps aligned prices unflagged", () => {
  assert.deepEqual(
    assessCardmarketPriceReliability({
      trendPrice: 100,
      averageSellPrice: 96,
      avg7: 102,
      avg30: 98,
      lowPrice: 75,
      previousTrendPrice: 97,
    }),
    { status: "normal", isFlagged: false, flags: [] },
  );
});

test("one large Cardmarket reference difference is suspicious but not high risk", () => {
  const reliability = assessCardmarketPriceReliability({
    trendPrice: 500,
    averageSellPrice: 100,
  });

  assert.equal(reliability.status, "suspicious");
  assert.equal(reliability.isFlagged, true);
  assert.equal(reliability.flags[0]?.code, "trend_far_from_reference");
  assert.equal(reliability.flags[0]?.ratio, 5);
});

test("corroborated Cardmarket consensus differences can be high risk", () => {
  const reliability = assessCardmarketPriceReliability({
    trendPrice: 500,
    averageSellPrice: 100,
    avg7: 105,
    avg30: 110,
  });

  assert.equal(reliability.status, "high_risk");
  assert.equal(reliability.isFlagged, true);
  assert.equal(reliability.flags[0]?.code, "trend_far_from_consensus");
});

test("multiple suspicious Cardmarket signals become high risk", () => {
  const reliability = assessCardmarketPriceReliability({
    trendPrice: 300,
    averageSellPrice: 100,
    previousTrendPrice: 100,
  });

  assert.equal(reliability.status, "high_risk");
  assert.equal(reliability.isFlagged, true);
  assert.deepEqual(
    reliability.flags.map((flag) => flag.code),
    ["trend_far_from_reference", "trend_far_from_previous"],
  );
});

test("Cardmarket reliability ignores trend prices below $25", () => {
  assert.deepEqual(
    assessCardmarketPriceReliability({
      trendPrice: 24.99,
      averageSellPrice: 1,
      avg7: 1,
      avg30: 1,
      lowPrice: 0.01,
      previousTrendPrice: 1,
    }),
    { status: "normal", isFlagged: false, flags: [] },
  );
});
