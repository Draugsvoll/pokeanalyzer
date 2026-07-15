import { useEffect, useState } from "react";
import { useAuth } from "../context/authContextValue";
import { MEMBERSHIP_PLANS } from "./plans";
import {
  activateMembershipPlan as activateMembershipPlanRequest,
  cancelSubscriptionAtPeriodEnd,
  fetchSubscription,
} from "./subscriptionApi";
import type {
  MembershipPlan,
  MembershipPlanId,
  UserSubscription,
} from "./types";

export function useMembershipSubscription() {
  const { user } = useAuth();
  const [membershipPlans, setMembershipPlans] =
    useState<MembershipPlan[]>(MEMBERSHIP_PLANS);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [updatingSubscription, setUpdatingSubscription] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);

  const refreshSubscription = async () => {
    if (!user) {
      setSubscription(null);
      setLoadingSubscription(false);
      return null;
    }

    try {
      setLoadingSubscription(true);
      const response = await fetchSubscription(user);
      if (response.plans) setMembershipPlans(response.plans);
      setSubscription(response.subscription);
      return response.subscription;
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
      setSubscriptionMessage("Could not load subscription");
      return null;
    } finally {
      setLoadingSubscription(false);
    }
  };

  const activateMembershipPlan = async (planId: MembershipPlanId) => {
    if (!user || updatingSubscription) return false;

    try {
      setUpdatingSubscription(true);
      setSubscriptionMessage(null);
      const response = await activateMembershipPlanRequest(user, planId);
      if (response.plans) setMembershipPlans(response.plans);
      setSubscription(response.subscription);
      setSubscriptionMessage(
        response.amount != null
          ? `Plan active. Charged ${response.amount} NOK`
          : "Plan active"
      );
      return true;
    } catch (error) {
      console.error("Failed to activate membership plan:", error);
      setSubscriptionMessage(
        error instanceof Error ? error.message : "Could not activate plan"
      );
      return false;
    } finally {
      setUpdatingSubscription(false);
    }
  };

  const cancelAtPeriodEnd = async () => {
    if (!user || !subscription || updatingSubscription) return false;

    try {
      setUpdatingSubscription(true);
      setSubscriptionMessage(null);
      const response = await cancelSubscriptionAtPeriodEnd(user);
      setSubscription(response.subscription);
      setSubscriptionMessage("Subscription will cancel at period end");
      return true;
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
      setSubscriptionMessage(
        error instanceof Error ? error.message : "Could not cancel subscription"
      );
      return false;
    } finally {
      setUpdatingSubscription(false);
    }
  };

  useEffect(() => {
    void refreshSubscription();
  }, [user?.uid]);

  return {
    activateMembershipPlan,
    cancelAtPeriodEnd,
    loadingSubscription,
    membershipPlans,
    refreshSubscription,
    subscription,
    subscriptionMessage,
    updateSubscription: setSubscription,
    updatingSubscription,
  };
}
