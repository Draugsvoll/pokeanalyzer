import type { MembershipPlanId } from "./subscriptions/plans.js";

export const EBAY_REQUEST_CREDIT_COST = 1;
export const EBAY_SIGNUP_CREDITS = 10;

export type EbayCredits = {
  membershipCreditsRemaining: number;
  membershipCreditsTotal: number;
  membershipCreditsUsed: number;
  bonusCreditsRemaining: number;
  bonusCreditsTotal: number;
  bonusCreditsUsed: number;
  creditsRemaining: number;
  planId: MembershipPlanId;
  currentPeriodEnd?: string;
  version: number;
};
