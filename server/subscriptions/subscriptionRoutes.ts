import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUid, requireVerifiedUser } from "../security/auth.js";
import { logError } from "../security/logging.js";
import {
  FREE_BONUS_CREDITS,
  FREE_MEMBERSHIP_PLAN,
  MEMBERSHIP_PLANS,
} from "../../shared/subscriptions/plans.js";
import {
  cancelStripeSubscriptionAtPeriodEnd,
  createBillingPortal,
  createMembershipCheckout,
  createTopUpCheckout,
} from "./stripePayments.js";
import { adminDb } from "./firebaseAdmin.js";
import {
  serializeSubscription,
  type StoredUserSubscription,
} from "./subscriptionModel.js";

const router = Router();

const stripeActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many billing requests. Please wait and try again.",
  },
});

router.post(
  "/checkout/membership",
  requireVerifiedUser,
  stripeActionLimiter,
  createMembershipCheckout,
);
router.post(
  "/checkout/top-up",
  requireVerifiedUser,
  stripeActionLimiter,
  createTopUpCheckout,
);
router.post(
  "/billing-portal",
  requireVerifiedUser,
  stripeActionLimiter,
  createBillingPortal,
);
router.post(
  "/cancel-at-period-end",
  requireVerifiedUser,
  stripeActionLimiter,
  cancelStripeSubscriptionAtPeriodEnd,
);

function getSafeErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("Could not load the default credentials") ||
    message.includes("Unable to detect a Project Id") ||
    message.includes("The Application Default Credentials")
  ) {
    return "Firebase Admin is not configured on the backend.";
  }

  return fallback;
}

function userSubscriptionRef(uid: string) {
  return adminDb.doc(`users/${uid}/subscription/current`);
}

function eventsCollection(uid: string) {
  return adminDb.collection(`users/${uid}/subscription_events`);
}

function buildFreeSubscription(): StoredUserSubscription {
  return {
    bonusCreditsRemaining: FREE_BONUS_CREDITS,
    bonusCreditsTotal: FREE_BONUS_CREDITS,
    bonusCreditsUsed: 0,
    cancelAtPeriodEnd: false,
    membershipCreditsRemaining: 0,
    membershipCreditsTotal: 0,
    membershipCreditsUsed: 0,
    planId: FREE_MEMBERSHIP_PLAN.id,
    planName: FREE_MEMBERSHIP_PLAN.name,
    status: "active",
  };
}

router.get("/plans", (_req, res) => {
  res.json({ plans: MEMBERSHIP_PLANS });
});

router.get("/me", requireVerifiedUser, async (_req: Request, res: Response) => {
  try {
    const uid = getAuthenticatedUid(res);
    const subscriptionSnap = await userSubscriptionRef(uid).get();
    const subscription = subscriptionSnap.exists
      ? (subscriptionSnap.data() as StoredUserSubscription)
      : null;

    res.json({
      plans: MEMBERSHIP_PLANS,
      subscription: serializeSubscription(subscription),
    });
  } catch (error) {
    logError("Failed to fetch subscription", error);
    res.status(500).json({ message: "Failed to fetch subscription" });
  }
});

router.post(
  "/initialize-free",
  requireVerifiedUser,
  async (_req: Request, res: Response) => {
    try {
      const uid = getAuthenticatedUid(res);

      const subscriptionRef = userSubscriptionRef(uid);
      const existingSubscription = await subscriptionRef.get();
      if (existingSubscription.exists) {
        res.json({
          plans: MEMBERSHIP_PLANS,
          subscription: serializeSubscription(
            existingSubscription.data() as StoredUserSubscription,
          ),
        });
        return;
      }

      const subscription = buildFreeSubscription();
      const batch = adminDb.batch();
      batch.set(subscriptionRef, {
        ...subscription,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(eventsCollection(uid).doc(), {
        bonusCredits: FREE_BONUS_CREDITS,
        eventType: "free_subscription_initialized",
        planId: FREE_MEMBERSHIP_PLAN.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      res.json({
        plans: MEMBERSHIP_PLANS,
        subscription: serializeSubscription(subscription),
      });
    } catch (error) {
      logError("Failed to initialize free subscription", error);
      res.status(500).json({
        message: getSafeErrorMessage(error, "Failed to initialize free subscription"),
      });
    }
  },
);

export default router;
