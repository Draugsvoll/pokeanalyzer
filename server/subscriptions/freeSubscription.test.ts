import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import {
  buildFreeSubscription,
  getFreeSubscriptionRefresh,
} from "./freeSubscription.js";

test("new free subscriptions receive monthly credits without signup bonus credits", () => {
  const subscription = buildFreeSubscription(
    new Date("2026-01-15T12:00:00.000Z"),
  );

  assert.equal(subscription.bonusCreditsRemaining, 0);
  assert.equal(subscription.bonusCreditsTotal, 0);
  assert.equal(subscription.membershipCreditsRemaining, 3);
  assert.equal(subscription.membershipCreditsTotal, 3);
  assert.equal(
    subscription.currentPeriodEnd?.toDate().toISOString(),
    "2026-02-15T12:00:00.000Z",
  );
});

test("free credits refresh after the monthly period and keep a stable boundary", () => {
  const subscription = {
    ...buildFreeSubscription(new Date("2026-01-31T12:00:00.000Z")),
    currentPeriodStart: Timestamp.fromDate(
      new Date("2026-01-31T12:00:00.000Z"),
    ),
    currentPeriodEnd: Timestamp.fromDate(new Date("2026-02-28T12:00:00.000Z")),
    membershipCreditsRemaining: 0,
    membershipCreditsUsed: 3,
  };

  const refresh = getFreeSubscriptionRefresh(
    subscription,
    new Date("2026-03-01T00:00:00.000Z"),
  );

  assert.equal(refresh?.membershipCreditsRemaining, 3);
  assert.equal(refresh?.membershipCreditsUsed, 0);
  assert.equal(
    refresh?.currentPeriodStart?.toDate().toISOString(),
    "2026-02-28T12:00:00.000Z",
  );
  assert.equal(
    refresh?.currentPeriodEnd?.toDate().toISOString(),
    "2026-03-28T12:00:00.000Z",
  );
});

test("legacy free subscriptions are migrated into a monthly period", () => {
  const legacy = buildFreeSubscription(new Date("2026-01-01T00:00:00.000Z"));
  delete legacy.currentPeriodStart;
  delete legacy.currentPeriodEnd;
  legacy.membershipCreditsRemaining = 0;
  legacy.membershipCreditsTotal = 0;

  const refresh = getFreeSubscriptionRefresh(
    legacy,
    new Date("2026-09-20T10:00:00.000Z"),
  );

  assert.equal(refresh?.membershipCreditsRemaining, 3);
  assert.equal(
    refresh?.currentPeriodStart?.toDate().toISOString(),
    "2026-09-20T10:00:00.000Z",
  );
});

test("an active free period is left unchanged", () => {
  const subscription = buildFreeSubscription(
    new Date("2026-09-01T00:00:00.000Z"),
  );
  assert.equal(
    getFreeSubscriptionRefresh(
      subscription,
      new Date("2026-09-20T00:00:00.000Z"),
    ),
    null,
  );
});
