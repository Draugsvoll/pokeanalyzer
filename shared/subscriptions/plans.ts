export type MembershipPlanId = "free" | "collector" | "pro";

export type MembershipPlan = {
  billingInterval: "month";
  credits: number;
  ebayCredits: number;
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
    credits: 0,
    ebayCredits: 0,
    description: "Explore card details and market prices at no cost.",
    features: [
      "10 free eBay credits at signup",
      "Track 10 cards in portfolio",
      "Track 10 cards in watchlist",
      "Basic card details and price data",
    ],
  },
  {
    id: "collector",
    name: "Collector",
    price: 5.99,
    currency: "USD",
    billingInterval: "month",
    credits: 3,
    ebayCredits: 100,
    description: "Built for regular research across an active collection.",
    features: [
      "Everything in Free",
      "3 AI credits every month",
      "100 eBay credits every month",
      "Track unlimited cards in portfolio",
      "Track unlimited cards in watchlist",
      "Weekly market summary",
      "Graded prices",
      "Price history",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 14.99,
    currency: "USD",
    billingInterval: "month",
    credits: 9,
    ebayCredits: 300,
    description: "More monthly capacity for frequent analysis.",
    features: [
      "Everything in Collector",
      "9 AI credits every month",
      "300 eBay credits every month",
    ],
  },
];

export const FREE_MEMBERSHIP_PLAN = MEMBERSHIP_PLANS[0];

export function getMembershipPlan(planId: string | undefined) {
  return MEMBERSHIP_PLANS.find((plan) => plan.id === planId);
}
