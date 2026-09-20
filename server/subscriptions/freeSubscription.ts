import { Timestamp } from "firebase-admin/firestore";
import { FREE_MEMBERSHIP_PLAN } from "../../shared/subscriptions/plans.js";
import type { StoredUserSubscription } from "./subscriptionModel.js";

type FreePeriodFields = Pick<
  StoredUserSubscription,
  | "currentPeriodEnd"
  | "currentPeriodStart"
  | "membershipCreditsRemaining"
  | "membershipCreditsTotal"
  | "membershipCreditsUsed"
>;

function addUtcMonth(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDayOfNextMonth = new Date(
    Date.UTC(year, month + 2, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      year,
      month + 1,
      Math.min(day, lastDayOfNextMonth),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

function periodStartingAt(start: Date): FreePeriodFields {
  return {
    currentPeriodStart: Timestamp.fromDate(start),
    currentPeriodEnd: Timestamp.fromDate(addUtcMonth(start)),
    membershipCreditsRemaining: FREE_MEMBERSHIP_PLAN.credits,
    membershipCreditsTotal: FREE_MEMBERSHIP_PLAN.credits,
    membershipCreditsUsed: 0,
  };
}

export function buildFreeSubscription(
  now = new Date(),
): StoredUserSubscription {
  return {
    bonusCreditsRemaining: 0,
    bonusCreditsTotal: 0,
    bonusCreditsUsed: 0,
    cancelAtPeriodEnd: false,
    ...periodStartingAt(now),
    planId: FREE_MEMBERSHIP_PLAN.id,
    planName: FREE_MEMBERSHIP_PLAN.name,
    status: "active",
  };
}

export function getFreeSubscriptionRefresh(
  subscription: StoredUserSubscription,
  now = new Date(),
): FreePeriodFields | null {
  if (subscription.planId !== FREE_MEMBERSHIP_PLAN.id) return null;

  const currentPeriodStart = subscription.currentPeriodStart?.toDate();
  const currentPeriodEnd = subscription.currentPeriodEnd?.toDate();
  const hasCurrentPeriod =
    currentPeriodStart instanceof Date &&
    Number.isFinite(currentPeriodStart.getTime()) &&
    currentPeriodEnd instanceof Date &&
    Number.isFinite(currentPeriodEnd.getTime());

  if (
    hasCurrentPeriod &&
    currentPeriodEnd > now &&
    subscription.membershipCreditsTotal === FREE_MEMBERSHIP_PLAN.credits
  ) {
    return null;
  }

  if (!hasCurrentPeriod || currentPeriodEnd > now) {
    return periodStartingAt(currentPeriodStart ?? now);
  }

  let nextPeriodStart = currentPeriodEnd;
  let nextPeriodEnd = addUtcMonth(nextPeriodStart);
  while (nextPeriodEnd <= now) {
    nextPeriodStart = nextPeriodEnd;
    nextPeriodEnd = addUtcMonth(nextPeriodStart);
  }

  return {
    currentPeriodStart: Timestamp.fromDate(nextPeriodStart),
    currentPeriodEnd: Timestamp.fromDate(nextPeriodEnd),
    membershipCreditsRemaining: FREE_MEMBERSHIP_PLAN.credits,
    membershipCreditsTotal: FREE_MEMBERSHIP_PLAN.credits,
    membershipCreditsUsed: 0,
  };
}
