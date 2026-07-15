import type { MembershipPlan } from "./types";

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
    price: 79,
    currency: "NOK",
    billingInterval: "month",
    credits: 100,
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    currency: "NOK",
    billingInterval: "month",
    credits: 500,
  },
];

export const FREE_BONUS_CREDITS = 20;
export const DEFAULT_MEMBERSHIP_PLAN = MEMBERSHIP_PLANS[1];
