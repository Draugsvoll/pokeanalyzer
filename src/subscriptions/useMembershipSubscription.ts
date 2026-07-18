import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/authContextValue";
import { MEMBERSHIP_PLANS } from "../../shared/subscriptions/plans";
import {
  cancelSubscriptionAtPeriodEnd,
  createBillingPortal,
  createMembershipCheckout,
  fetchSubscription,
} from "./subscriptionApi";
import type {
  MembershipPlan,
  MembershipPlanId,
  UserSubscription,
} from "./types";
import { logClientError } from "../utils/logClientError";

export function useMembershipSubscription() {
  const { user } = useAuth();
  const subscriptionActionInProgressRef = useRef(false);
  const [membershipPlans, setMembershipPlans] =
    useState<MembershipPlan[]>(MEMBERSHIP_PLANS);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);

  const refreshSubscription = useCallback(async (background = false) => {
    if (!user) {
      setSubscription(null);
      setLoadingSubscription(false);
      return null;
    }

    try {
      if (!background) setLoadingSubscription(true);
      const response = await fetchSubscription(user);
      if (response.plans) setMembershipPlans(response.plans);
      setSubscription(response.subscription);
      return response.subscription;
    } catch (error) {
      logClientError("Failed to fetch subscription", error);
      setSubscriptionMessage("Could not load subscription");
      return null;
    } finally {
      if (!background) setLoadingSubscription(false);
    }
  }, [user]);

  const startMembershipCheckout = async (planId: MembershipPlanId) => {
    if (!user || subscriptionActionInProgressRef.current) return false;

    try {
      subscriptionActionInProgressRef.current = true;
      setUpdatingSubscription(true);
      setSubscriptionMessage(null);
      const response = await createMembershipCheckout(user, planId);
      window.location.assign(response.checkoutUrl);
      return true;
    } catch (error) {
      logClientError("Failed to activate membership plan", error);
      setSubscriptionMessage(
        error instanceof Error ? error.message : "Could not activate plan"
      );
      subscriptionActionInProgressRef.current = false;
      setUpdatingSubscription(false);
      return false;
    }
  };

  const openBillingPortal = async () => {
    if (!user || subscriptionActionInProgressRef.current) return false;

    try {
      subscriptionActionInProgressRef.current = true;
      setUpdatingSubscription(true);
      setSubscriptionMessage(null);
      const response = await createBillingPortal(user);
      window.location.assign(response.portalUrl);
      return true;
    } catch (error) {
      logClientError("Failed to open billing portal", error);
      setSubscriptionMessage(
        error instanceof Error ? error.message : "Could not open billing portal"
      );
      subscriptionActionInProgressRef.current = false;
      setUpdatingSubscription(false);
      return false;
    }
  };

  const cancelAtPeriodEnd = async () => {
    if (!user || !subscription || subscriptionActionInProgressRef.current) return false;

    try {
      subscriptionActionInProgressRef.current = true;
      setUpdatingSubscription(true);
      setSubscriptionMessage(null);
      const response = await cancelSubscriptionAtPeriodEnd(user);
      setSubscription(response.subscription);
      setSubscriptionMessage("Subscription will cancel at period end");
      return true;
    } catch (error) {
      logClientError("Failed to cancel subscription", error);
      setSubscriptionMessage(
        error instanceof Error ? error.message : "Could not cancel subscription"
      );
      return false;
    } finally {
      subscriptionActionInProgressRef.current = false;
      setUpdatingSubscription(false);
    }
  };

  useEffect(() => {
    // Loading remote subscription state is the purpose of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSubscription();
  }, [refreshSubscription]);

  useEffect(() => {
    const checkoutState = new URLSearchParams(window.location.search).get("checkout");
    if (!checkoutState || !user) return;

    window.history.replaceState({}, "", window.location.pathname);

    if (checkoutState !== "success") return;

    const refreshTimers = [1200, 3500, 7000].map((delay) =>
      window.setTimeout(() => void refreshSubscription(true), delay)
    );

    return () => refreshTimers.forEach(window.clearTimeout);
  }, [refreshSubscription, user]);

  return {
    cancelAtPeriodEnd,
    loadingSubscription,
    membershipPlans,
    openBillingPortal,
    refreshSubscription,
    startMembershipCheckout,
    subscription,
    subscriptionMessage,
    updateSubscription: setSubscription,
    updatingSubscription,
  };
}
