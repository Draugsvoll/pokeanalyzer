import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { getMembershipPlan } from "../../shared/subscriptions/plans.js";
import { buildFreeSubscription } from "./freeSubscription.js";
import { serializeSubscription } from "./subscriptionModel.js";
import { getStripeMembershipPlanId } from "./stripePayments.js";

test("Basic and Pro expose the new prices and preserve AI allowances", () => {
  const basic = getMembershipPlan("basic")!;
  const pro = getMembershipPlan("pro")!;
  assert.deepEqual(
    [basic.price, basic.currency, basic.ebayCredits, basic.credits],
    [2.99, "USD", 5, 3],
  );
  assert.deepEqual(
    [pro.price, pro.currency, pro.ebayCredits, pro.credits],
    [5.99, "USD", null, 9],
  );
  assert.equal(getMembershipPlan("collector"), basic);
});

test("serialized legacy subscriptions become Basic without modifying stored credits", () => {
  const stored = {
    ...buildFreeSubscription(),
    planId: "collector",
    planName: "Collector",
  };
  const result = serializeSubscription(stored)!;
  assert.equal(result.planId, "basic");
  assert.equal(result.planName, "Basic");
  assert.equal(
    result.membershipCreditsRemaining,
    stored.membershipCreditsRemaining,
  );
  assert.equal(stored.planId, "collector");
});

test("Stripe recognizes new and legacy prices and rejects unknown prices", () => {
  const settings = {
    STRIPE_BASIC_PRICE_ID: "price_basic_new",
    STRIPE_PRO_PRICE_ID: "price_pro_new",
    STRIPE_COLLECTOR_PRICE_ID: "price_collector_old",
    STRIPE_LEGACY_PRO_PRICE_IDS: "price_pro_old, price_pro_older",
  };
  const previous = Object.fromEntries(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, settings);
  try {
    for (const [price, expected] of [
      ["price_basic_new", "basic"],
      ["price_collector_old", "basic"],
      ["price_pro_new", "pro"],
      ["price_pro_old", "pro"],
      ["price_pro_older", "pro"],
      ["price_unknown", null],
    ]) {
      const subscription = {
        items: { data: [{ price: { id: price } }] },
      } as Stripe.Subscription;
      assert.equal(getStripeMembershipPlanId(subscription), expected);
    }
    assert.equal(
      getStripeMembershipPlanId({
        items: { data: [] },
      } as unknown as Stripe.Subscription),
      null,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
