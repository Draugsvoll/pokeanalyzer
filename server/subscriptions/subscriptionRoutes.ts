import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUid, requireVerifiedUser } from "../security/auth.js";
import { logError } from "../security/logging.js";
import {
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
  buildFreeSubscription,
  getFreeSubscriptionRefresh,
} from "./freeSubscription.js";
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

router.get("/plans", (_req, res) => {
  res.json({ plans: MEMBERSHIP_PLANS });
});

router.get("/me", requireVerifiedUser, async (_req: Request, res: Response) => {
  try {
    const uid = getAuthenticatedUid(res);
    const subscriptionRef = userSubscriptionRef(uid);
    const subscription = await adminDb.runTransaction(async (transaction) => {
      const subscriptionSnap = await transaction.get(subscriptionRef);
      if (!subscriptionSnap.exists) return null;

      const current = subscriptionSnap.data() as StoredUserSubscription;
      const refresh = getFreeSubscriptionRefresh(current);
      if (!refresh) return current;

      transaction.update(subscriptionRef, {
        ...refresh,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ...current, ...refresh };
    });

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
      const eventRef = eventsCollection(uid).doc();
      const subscription = await adminDb.runTransaction(async (transaction) => {
        const existingSubscription = await transaction.get(subscriptionRef);
        if (existingSubscription.exists) {
          const current = existingSubscription.data() as StoredUserSubscription;
          const refresh = getFreeSubscriptionRefresh(current);
          if (refresh) {
            transaction.update(subscriptionRef, {
              ...refresh,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          return refresh ? { ...current, ...refresh } : current;
        }

        const initialSubscription = buildFreeSubscription();
        transaction.set(subscriptionRef, {
          ...initialSubscription,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(eventRef, {
          eventType: "free_subscription_initialized",
          membershipCredits: FREE_MEMBERSHIP_PLAN.credits,
          planId: FREE_MEMBERSHIP_PLAN.id,
          createdAt: FieldValue.serverTimestamp(),
        });
        return initialSubscription;
      });

      res.json({
        plans: MEMBERSHIP_PLANS,
        subscription: serializeSubscription(subscription),
      });
    } catch (error) {
      logError("Failed to initialize free subscription", error);
      res.status(500).json({
        message: getSafeErrorMessage(
          error,
          "Failed to initialize free subscription",
        ),
      });
    }
  },
);

export default router;
