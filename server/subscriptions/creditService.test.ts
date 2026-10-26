import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import { CreditHttpError, runPaidFeature } from "./creditService.js";
import type { StoredUserSubscription } from "./subscriptionModel.js";

function mockSubscription(t: TestContext, membership: number, bonus = 0) {
  const current: StoredUserSubscription = {
    bonusCreditsRemaining: bonus,
    bonusCreditsTotal: bonus,
    bonusCreditsUsed: 0,
    cancelAtPeriodEnd: false,
    membershipCreditsRemaining: membership,
    membershipCreditsTotal: membership,
    membershipCreditsUsed: 0,
    planId: "basic",
    planName: "Basic",
    status: "active",
  };
  const update = t.mock.fn<(values: unknown) => Promise<void>>(
    async () => undefined,
  );
  const transaction = {
    get: async () => ({ exists: true, data: () => current }),
  };
  t.mock.method(adminDb, "doc", () => ({ update }));
  t.mock.method(
    adminDb,
    "runTransaction",
    async (operation: (value: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
  );
  return update;
}

test("grading deducts two credits, using membership credits before bonus credits", async (t) => {
  const update = mockSubscription(t, 1, 1);
  const operation = t.mock.fn(async () => "grading result");
  const result = await runPaidFeature("user-1", "worth_grading", operation);

  assert.equal(result.data, "grading result");
  assert.equal(operation.mock.callCount(), 1);
  assert.equal(result.subscription?.membershipCreditsRemaining, 0);
  assert.equal(result.subscription?.bonusCreditsRemaining, 0);
  assert.equal(result.subscription?.membershipCreditsUsed, 1);
  assert.equal(result.subscription?.bonusCreditsUsed, 1);
  assert.equal(update.mock.callCount(), 1);
  assert.deepEqual(update.mock.calls[0].arguments[0], {
    bonusCreditsRemaining: FieldValue.increment(-1),
    bonusCreditsUsed: FieldValue.increment(1),
    membershipCreditsRemaining: FieldValue.increment(-1),
    membershipCreditsUsed: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });
});

test("grading with only one credit is rejected before analysis or deduction", async (t) => {
  const update = mockSubscription(t, 1);
  const operation = t.mock.fn(async () => "grading result");

  await assert.rejects(
    runPaidFeature("user-1", "worth_grading", operation),
    (error: unknown) =>
      error instanceof CreditHttpError && error.statusCode === 409,
  );
  assert.equal(operation.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test("other paid features still cost one credit", async (t) => {
  mockSubscription(t, 1);
  for (const feature of [
    "market_analysis",
    "collector_analysis",
    "card_identification",
    "authenticity_check",
  ]) {
    const result = await runPaidFeature(
      "user-1",
      feature,
      async () => "result",
    );
    assert.equal(result.subscription?.membershipCreditsRemaining, 0, feature);
    assert.equal(result.subscription?.membershipCreditsUsed, 1, feature);
  }
});

test("failed grading does not deduct credits", async (t) => {
  const update = mockSubscription(t, 2);
  await assert.rejects(
    runPaidFeature("user-1", "worth_grading", async () => {
      throw new Error("Analysis failed");
    }),
    /Analysis failed/,
  );
  assert.equal(update.mock.callCount(), 0);
});
