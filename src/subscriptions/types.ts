import type {
  MembershipPlan,
  MembershipPlanId,
} from "../../shared/subscriptions/plans";

export type {
  MembershipPlan,
  MembershipPlanId,
} from "../../shared/subscriptions/plans";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | "expired";

export type UserSubscription = {
  bonusCreditsRemaining: number;
  bonusCreditsTotal: number;
  bonusCreditsUsed: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  membershipCreditsRemaining: number;
  membershipCreditsTotal: number;
  membershipCreditsUsed: number;
  planId: MembershipPlanId;
  planName: string;
  status: SubscriptionStatus;
  stripePriceId?: string;
  stripeSubscriptionId?: string;
};

export type CreditUsageFeature =
  | "price_analysis"
  | "sell_price"
  | "collector_analysis"
  | "ebay_sold"
  | "worth_grading"
  | "card_identification"
  | "authenticity_check"
  | "market_news"
  | "manual_test";

export type PaidFeatureResponse<T> = {
  data: T;
  subscription: UserSubscription;
};

export type SubscriptionResponse = {
  amount?: number;
  plans?: MembershipPlan[];
  subscription: UserSubscription | null;
};

export type CheckoutResponse = {
  checkoutUrl: string;
};

export type TopUpPackageId = "credits_100";

export type BillingPortalResponse = {
  portalUrl: string;
};
