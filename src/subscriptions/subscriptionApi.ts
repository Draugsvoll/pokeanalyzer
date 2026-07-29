import type { User } from "firebase/auth";
import type {
  BillingPortalResponse,
  CheckoutResponse,
  MembershipPlanId,
  SubscriptionResponse,
  TopUpPackageId,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export const SUBSCRIPTION_REFRESH_EVENT = "pokeanalyzer:subscription-refresh";

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

export async function initializeFreeSubscription(user: User) {
  const response = await subscriptionRequest<SubscriptionResponse>(user, "/initialize-free", {
    method: "POST",
  });
  window.dispatchEvent(new Event(SUBSCRIPTION_REFRESH_EVENT));
  return response;
}

export function createMembershipCheckout(user: User, planId: MembershipPlanId) {
  return subscriptionRequest<CheckoutResponse>(user, "/checkout/membership", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
}

export function createTopUpCheckout(
  user: User,
  packageId: TopUpPackageId,
) {
  return subscriptionRequest<CheckoutResponse>(user, "/checkout/top-up", {
    method: "POST",
    body: JSON.stringify({
      packageId,
      requestId: window.crypto.randomUUID(),
    }),
  });
}

export function cancelSubscriptionAtPeriodEnd(user: User) {
  return subscriptionRequest<SubscriptionResponse>(user, "/cancel-at-period-end", {
    method: "POST",
  });
}

export function createBillingPortal(user: User) {
  return subscriptionRequest<BillingPortalResponse>(user, "/billing-portal", {
    method: "POST",
  });
}
