export type MembershipPlanId = "free" | "collector" | "pro";

export type MembershipPlan = {
  billingInterval: "month";
  credits: number;
  currency: "NOK" | "USD";
  description: string;
  features: readonly string[];
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
    credits: 3,
    description: "Explore card insights and AI-powered analysis at no cost.",
    features: [
      "3 AI credits every month",
      "Track 10 cards in portfolio",
      "Basic card details and price data",
    ],
  },
  {
    id: "collector",
    name: "Collector",
    price: 3.99,
    currency: "USD",
    billingInterval: "month",
    credits: 20,
    description: "Built for regular research across an active collection.",
    features: [
      "Everything in Free",
      "20 AI credits every month",
      "Track 100 cards in portfolio",
      "Graded prices",
      "Price history",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 11.99,
    currency: "USD",
    billingInterval: "month",
    credits: 60,
    description: "More monthly capacity for frequent, in-depth analysis.",
    features: [
      "Everything in Collector",
      "60 AI credits every month",
      "Track unlimited cards in portfolio",
    ],
  },
];

export const FREE_MEMBERSHIP_PLAN = MEMBERSHIP_PLANS[0];

export function getMembershipPlan(planId: string | undefined) {
  return MEMBERSHIP_PLANS.find((plan) => plan.id === planId);
}
