export type MembershipPlanId = "free" | "collector" | "pro";

export type MembershipPlan = {
  billingInterval: "month";
  credits: number;
  currency: "NOK" | "USD";
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
  },
  {
    id: "collector",
    name: "Collector",
    price: 8,
    currency: "USD",
    billingInterval: "month",
    credits: 100,
  },
  {
    id: "pro",
    name: "Pro",
    price: 14,
    currency: "USD",
    billingInterval: "month",
    credits: 500,
  },
];

export const FREE_BONUS_CREDITS = 20;
export const FREE_MEMBERSHIP_PLAN = MEMBERSHIP_PLANS[0];

export function getMembershipPlan(planId: string | undefined) {
  return MEMBERSHIP_PLANS.find((plan) => plan.id === planId);
}
