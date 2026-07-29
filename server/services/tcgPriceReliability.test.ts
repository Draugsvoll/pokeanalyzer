import assert from "node:assert/strict";
import test from "node:test";
import { assessTcgPriceReliability } from "./tcgPriceReliability.js";

test("TCG price reliability flags only suspicious internal relationships", () => {
  assert.deepEqual(
    assessTcgPriceReliability({
      low: 90,
      mid: 100,
      high: 120,
      market: 85,
    }),
    { status: "normal", flags: [] },
  );

  const belowLow = assessTcgPriceReliability({
    low: 100,
    mid: 120,
    high: 150,
    market: 70,
  });
  assert.equal(belowLow.status, "suspicious");
  assert.equal(belowLow.flags[0]?.code, "market_below_listing_range");
  assert.equal(belowLow.flags[0]?.differencePercent, 30);

  const aboveHigh = assessTcgPriceReliability({
    low: 251.32,
    mid: 533.51,
    high: 815.7,
    market: 999,
  });
  assert.equal(aboveHigh.status, "suspicious");
  assert.equal(aboveHigh.flags[0]?.code, "market_above_listing_range");
  assert.equal(aboveHigh.flags[0]?.differencePercent, 22.47);

  const highRisk = assessTcgPriceReliability({
    low: 100,
    mid: 120,
    high: 150,
    market: 300,
  });
  assert.equal(highRisk.status, "high_risk");
  assert.deepEqual(
    highRisk.flags.map((flag) => flag.code),
    ["market_above_listing_range", "market_far_from_mid"],
  );

  const extremeSpread = assessTcgPriceReliability({
    low: 10,
    mid: 20,
    high: 300,
    market: 20,
  });
  assert.equal(extremeSpread.status, "high_risk");
  assert.equal(
    extremeSpread.flags.at(-1)?.code,
    "extreme_listing_spread",
  );
});
