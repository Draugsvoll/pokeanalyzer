import type { User } from "firebase/auth";
import type {
  CreditUsageFeature,
  MembershipPlanId,
  SubscriptionResponse,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function subscriptionRequest<T>(
  user: User,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(`${API_URL}/api/subscription${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchSubscription(user: User) {
  return subscriptionRequest<SubscriptionResponse>(user, "/me");
}

export function initializeFreeSubscription(user: User) {
  return subscriptionRequest<SubscriptionResponse>(user, "/initialize-free", {
    method: "POST",
  });
}

export function activateMembershipPlan(user: User, planId: MembershipPlanId) {
  return subscriptionRequest<SubscriptionResponse>(user, "/activate", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
}

export function cancelSubscriptionAtPeriodEnd(user: User) {
  return subscriptionRequest<SubscriptionResponse>(user, "/cancel-at-period-end", {
    method: "POST",
  });
}

export function topUpCredits(user: User, credits: number, amount = 0) {
  return subscriptionRequest<SubscriptionResponse>(user, "/top-up", {
    method: "POST",
    body: JSON.stringify({ amount, credits }),
  });
}

export function spendCredits(
  user: User,
  feature: CreditUsageFeature,
  credits = 1
) {
  return subscriptionRequest<SubscriptionResponse>(user, "/spend", {
    method: "POST",
    body: JSON.stringify({ credits, feature }),
  });
}
