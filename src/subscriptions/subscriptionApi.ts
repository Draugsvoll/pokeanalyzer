import type { User } from "firebase/auth";
import type {
  BillingPortalResponse,
  CheckoutResponse,
  CreditUsageFeature,
  MembershipPlanId,
  SubscriptionResponse,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TOP_UP_PAYMENT_LINK = import.meta.env.VITE_STRIPE_TOPUP_PAYMENT_LINK?.trim();

export function getTopUpPaymentLink(user: User) {
  if (!TOP_UP_PAYMENT_LINK) {
    throw new Error("Stripe top-up checkout is not configured");
  }
  if (!user.email) {
    throw new Error("A verified email is required for checkout");
  }

  const checkoutUrl = new URL(TOP_UP_PAYMENT_LINK);
  if (
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.hostname !== "buy.stripe.com" ||
    (import.meta.env.DEV && !checkoutUrl.pathname.startsWith("/test_"))
  ) {
    throw new Error("Stripe top-up checkout URL is invalid");
  }

  checkoutUrl.searchParams.set("client_reference_id", user.uid);
  checkoutUrl.searchParams.set("locked_prefilled_email", user.email);
  return checkoutUrl.toString();
}

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

export function createMembershipCheckout(user: User, planId: MembershipPlanId) {
  return subscriptionRequest<CheckoutResponse>(user, "/checkout/membership", {
    method: "POST",
    body: JSON.stringify({ planId }),
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
