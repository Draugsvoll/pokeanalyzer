import { useRef, useState } from "react";
import { useAuth } from "../context/authContextValue";
import { createTopUpCheckout } from "./subscriptionApi";
import type { UserSubscription } from "./types";
import { logClientError } from "../utils/logClientError";

export function useCredits(subscription: UserSubscription | null) {
  const { user } = useAuth();
  const creditActionInProgressRef = useRef(false);
  const [updatingCredits, setUpdatingCredits] = useState(false);
  const [creditMessage, setCreditMessage] = useState<string | null>(null);

  const topUpCredits = async () => {
    if (!user || creditActionInProgressRef.current) return false;

    try {
      creditActionInProgressRef.current = true;
      setUpdatingCredits(true);
      setCreditMessage(null);
      const response = await createTopUpCheckout(user, "credits_100");
      window.location.assign(response.checkoutUrl);
      return true;
    } catch (error) {
      logClientError("Failed to top up credits", error);
      setCreditMessage(
        error instanceof Error ? error.message : "Could not top up credits"
      );
      creditActionInProgressRef.current = false;
      setUpdatingCredits(false);
      return false;
    }
  };

  return {
    bonusCreditsRemaining: subscription?.bonusCreditsRemaining ?? 0,
    bonusCreditsTotal: subscription?.bonusCreditsTotal ?? 0,
    bonusCreditsUsed: subscription?.bonusCreditsUsed ?? 0,
    creditMessage,
    creditsRemaining:
      (subscription?.membershipCreditsRemaining ?? 0) +
      (subscription?.bonusCreditsRemaining ?? 0),
    creditsTotal:
      (subscription?.membershipCreditsTotal ?? 0) +
      (subscription?.bonusCreditsTotal ?? 0),
    creditsUsed:
      (subscription?.membershipCreditsUsed ?? 0) +
      (subscription?.bonusCreditsUsed ?? 0),
    hasCredits:
      ((subscription?.membershipCreditsRemaining ?? 0) +
        (subscription?.bonusCreditsRemaining ?? 0)) > 0,
    membershipCreditsRemaining: subscription?.membershipCreditsRemaining ?? 0,
    membershipCreditsTotal: subscription?.membershipCreditsTotal ?? 0,
    membershipCreditsUsed: subscription?.membershipCreditsUsed ?? 0,
    topUpCredits,
    updatingCredits,
  };
}
