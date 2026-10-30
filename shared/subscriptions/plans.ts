export type MembershipPlanId = "free" | "basic" | "pro";

export type MembershipPlanFeature = {
  highlighted?: boolean;
  label: string;
};

export type MembershipPlan = {
  billingInterval: "month";
  credits: number;
  ebayCredits: number | null; // null means unlimited during an active paid period.
  currency: "NOK" | "USD";
  description: string;
  features: readonly MembershipPlanFeature[];
  id: MembershipPlanId;
  name: string;
  price: number;
};

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    currency: "NOK",
    billingInterval: "month",
    credits: 0,
    ebayCredits: 0,
    description: "Explore card details and market prices at no cost.",
    features: [
      { label: "10 Market credits at signup", highlighted: true },
      { label: "Track 10 cards in portfolio & watchlist" },
      { label: "Basic card details and price data" },
    ],
  },
  {
    id: "basic",
    name: "Basic",
    price: 2.99,
    currency: "USD",
    billingInterval: "month",
    credits: 3,
    ebayCredits: 5,
    description: "Built for regular research across an active collection.",
    features: [
      { label: "Everything in Free" },
      { label: "3 AI credits every month" },
      { label: "5 eBay & TCGplayer searches every month" },
      { label: "Track unlimited cards in portfolio & watchlist" },
      { label: "Weekly market summary" },
      { label: "Price history & graded prices" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 5.99,
    currency: "USD",
    billingInterval: "month",
    credits: 9,
    ebayCredits: null,
    description:
      "Unlimited eBay & TCGplayer searches and more AI credits for frequent research.",
    features: [
      { label: "Everything in Basic" },
      { label: "9 AI credits every month" },
      { label: "Unlimited eBay & TCGplayer searches", highlighted: true },
    ],
  },
];

export const FREE_MEMBERSHIP_PLAN = MEMBERSHIP_PLANS[0];

export function getMembershipPlan(planId: string | undefined) {
  // Existing stored Collector subscriptions are now Basic.
  const canonicalId = planId === "collector" ? "basic" : planId;
  return MEMBERSHIP_PLANS.find((plan) => plan.id === canonicalId);
}
