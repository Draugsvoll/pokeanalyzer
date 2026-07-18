import type { Timestamp } from "firebase-admin/firestore";

export type StoredUserSubscription = {
  bonusCreditsRemaining: number;
  bonusCreditsTotal: number;
  bonusCreditsUsed: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Timestamp;
  currentPeriodStart?: Timestamp;
  membershipCreditsRemaining: number;
  membershipCreditsTotal: number;
  membershipCreditsUsed: number;
  planId: string;
  planName: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled" | "expired";
};

export function serializeSubscription(
  subscription: StoredUserSubscription | null,
) {
  if (!subscription) return null;

  return {
    ...subscription,
    currentPeriodEnd: subscription.currentPeriodEnd?.toDate().toISOString(),
    currentPeriodStart: subscription.currentPeriodStart?.toDate().toISOString(),
  };
}
