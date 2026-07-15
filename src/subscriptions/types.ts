export type MembershipPlanId = "free" | "collector" | "pro";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired";

export type MembershipEntitlement = {
  credits: number;
  id: "credits";
  label: "Credits";
};

export type MembershipPlan = {
  id: MembershipPlanId;
  name: string;
  price: number;
  currency: "NOK";
  billingInterval: "month";
  credits: number;
};

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
};

export type CreditUsageFeature =
  | "price_analysis"
  | "collector_analysis"
  | "ebay_sold"
  | "worth_grading"
  | "card_identification"
  | "market_news"
  | "manual_test";

export type SubscriptionResponse = {
  amount?: number;
  plans?: MembershipPlan[];
  subscription: UserSubscription | null;
};
