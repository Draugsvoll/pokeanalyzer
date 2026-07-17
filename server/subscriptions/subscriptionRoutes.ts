import { Router, type NextFunction, type Request, type Response } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebaseAdmin.js";
import {
  DEFAULT_MEMBERSHIP_PLAN,
  FREE_BONUS_CREDITS,
  FREE_MEMBERSHIP_PLAN,
  MEMBERSHIP_PLANS,
  getMembershipPlan,
  type MembershipPlan,
} from "./plans.js";
import {
  cancelStripeSubscriptionAtPeriodEnd,
  createBillingPortal,
  createMembershipCheckout,
  createTopUpCheckout,
} from "./stripePayments.js";

type UserSubscription = {
  bonusCreditsRemaining: number;
  bonusCreditsTotal: number;
  bonusCreditsUsed: number;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Timestamp;
  currentPeriodStart?: Timestamp;
  membershipCreditsRemaining: number;
  membershipCreditsTotal: number;
  membershipCreditsUsed: number;
  planId: string;
  planName: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled" | "expired";
};

const router = Router();

router.post("/checkout/membership", createMembershipCheckout);
router.post("/checkout/top-up", createTopUpCheckout);
router.post("/billing-portal", createBillingPortal);
router.post("/cancel-at-period-end", cancelStripeSubscriptionAtPeriodEnd);
router.use("/mock", (_req: Request, res: Response, next: NextFunction) => {
  if (process.env.ENABLE_MOCK_PAYMENTS === "true") {
    next();
    return;
  }
  res.status(404).json({ message: "Mock payments are disabled" });
});

function getSafeErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("Could not load the default credentials") ||
    message.includes("Unable to detect a Project Id") ||
    message.includes("The Application Default Credentials")
  ) {
    return "Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS to the backend .env and restart the server.";
  }

  return fallback;
}

function getNextBillingDate(date = new Date()) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate;
}

function serializeSubscription(subscription: UserSubscription | null) {
  if (!subscription) return null;

  return {
    ...subscription,
    currentPeriodEnd: subscription.currentPeriodEnd?.toDate().toISOString(),
    currentPeriodStart: subscription.currentPeriodStart?.toDate().toISOString(),
  };
}

function userSubscriptionRef(uid: string) {
  return adminDb.doc(`users/${uid}/subscription/current`);
}

function paymentsCollection(uid: string) {
  return adminDb.collection(`users/${uid}/payments`);
}

function eventsCollection(uid: string) {
  return adminDb.collection(`users/${uid}/subscription_events`);
}

function creditUsageCollection(uid: string) {
  return adminDb.collection(`users/${uid}/credit_usage`);
}

async function getUid(req: Request) {
  const authHeader = req.header("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return null;

  const decodedToken = await adminAuth.verifyIdToken(token);
  return decodedToken.uid;
}

async function seedMembershipPlans() {
  const batch = adminDb.batch();

  MEMBERSHIP_PLANS.forEach((plan) => {
    const planRef = adminDb.doc(`membership_plans/${plan.id}`);
    batch.set(
      planRef,
      {
        billingInterval: plan.billingInterval,
        credits: plan.credits,
        currency: plan.currency,
        name: plan.name,
        price: plan.price,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      planRef.collection("plan_entitlements").doc("credits"),
      {
        credits: plan.credits,
        id: "credits",
        label: "Credits",
      },
      { merge: true }
    );
  });

  await batch.commit();
}

function buildActiveSubscription(plan: MembershipPlan): UserSubscription {
  const periodStart = new Date();

  return {
    bonusCreditsRemaining: 0,
    bonusCreditsTotal: 0,
    bonusCreditsUsed: 0,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: Timestamp.fromDate(getNextBillingDate(periodStart)),
    currentPeriodStart: Timestamp.fromDate(periodStart),
    membershipCreditsRemaining: plan.credits,
    membershipCreditsTotal: plan.credits,
    membershipCreditsUsed: 0,
    planId: plan.id,
    planName: plan.name,
    status: "active",
  };
}

function buildFreeSubscription(): UserSubscription {
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

router.get("/me", async (req: Request, res: Response) => {
  try {
    const uid = await getUid(req);

    if (!uid) {
      res.status(401).json({ message: "Missing auth token" });
      return;
    }

    const subscriptionSnap = await userSubscriptionRef(uid).get();
    const subscription = subscriptionSnap.exists
      ? (subscriptionSnap.data() as UserSubscription)
      : null;

    res.json({
      plans: MEMBERSHIP_PLANS,
      subscription: serializeSubscription(subscription),
    });
  } catch (error) {
    console.error("Failed to fetch subscription:", error);
    res.status(500).json({ message: "Failed to fetch subscription" });
  }
});

router.post("/initialize-free", async (req: Request, res: Response) => {
  try {
    const uid = await getUid(req);

    if (!uid) {
      res.status(401).json({ message: "Missing auth token" });
      return;
    }

    await seedMembershipPlans();

    const subscriptionRef = userSubscriptionRef(uid);
    const existingSubscription = await subscriptionRef.get();

    if (existingSubscription.exists) {
      res.json({
        plans: MEMBERSHIP_PLANS,
        subscription: serializeSubscription(existingSubscription.data() as UserSubscription),
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
    console.error("Failed to initialize free subscription:", error);
    res.status(500).json({
      message: getSafeErrorMessage(error, "Failed to initialize free subscription"),
    });
  }
});

router.post("/mock/activate", async (req: Request, res: Response) => {
  try {
    const uid = await getUid(req);
    const planId = typeof req.body?.planId === "string" ? req.body.planId : undefined;
    const plan = getMembershipPlan(planId) ?? DEFAULT_MEMBERSHIP_PLAN;

    if (!uid) {
      res.status(401).json({ message: "Missing auth token" });
      return;
    }

    await seedMembershipPlans();

    const subscriptionRef = userSubscriptionRef(uid);
    const currentSnap = await subscriptionRef.get();
    const currentSubscription = currentSnap.exists
      ? (currentSnap.data() as UserSubscription)
      : null;
    const currentPlan = currentSubscription?.planId
      ? getMembershipPlan(currentSubscription.planId)
      : null;
    const isUpgrade =
      Boolean(currentSubscription && currentSubscription.status === "active" && currentPlan) &&
      plan.price > (currentPlan?.price ?? 0);
    const amount = isUpgrade ? Math.max(plan.price - (currentPlan?.price ?? 0), 0) : plan.price;
    const subscription = buildActiveSubscription(plan);
    const previousMembershipCreditsUsed = isUpgrade
      ? currentSubscription?.membershipCreditsUsed ?? 0
      : 0;
    const previousBonusCreditsRemaining = currentSubscription?.bonusCreditsRemaining ?? 0;
    const previousBonusCreditsTotal = currentSubscription?.bonusCreditsTotal ?? 0;
    const previousBonusCreditsUsed = currentSubscription?.bonusCreditsUsed ?? 0;

    if (isUpgrade) {
      subscription.membershipCreditsUsed = previousMembershipCreditsUsed;
      subscription.membershipCreditsRemaining = Math.max(
        plan.credits - previousMembershipCreditsUsed,
        0
      );
    }

    subscription.bonusCreditsRemaining = previousBonusCreditsRemaining;
    subscription.bonusCreditsTotal = previousBonusCreditsTotal;
    subscription.bonusCreditsUsed = previousBonusCreditsUsed;

    const batch = adminDb.batch();

    batch.set(
      subscriptionRef,
      {
        ...subscription,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(paymentsCollection(uid).doc(), {
      amount,
      credits: plan.credits,
      currency: plan.currency,
      fullPlanPrice: plan.price,
      isTopUp: false,
      isUpgrade,
      planId: plan.id,
      previousMembershipCreditsUsed,
      status: "paid",
      createdAt: FieldValue.serverTimestamp(),
    });

    batch.set(eventsCollection(uid).doc(), {
      amount,
      credits: plan.credits,
      eventType: currentSubscription ? "plan_changed" : "subscription_activated",
      fromPlanId: currentSubscription?.planId ?? null,
      isUpgrade,
      planId: plan.id,
      previousBonusCreditsRemaining,
      previousMembershipCreditsRemaining:
        currentSubscription?.membershipCreditsRemaining ?? null,
      previousMembershipCreditsUsed,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    res.json({
      amount,
      plans: MEMBERSHIP_PLANS,
      subscription: serializeSubscription(subscription),
    });
  } catch (error) {
    console.error("Failed to activate subscription:", error);
    res.status(500).json({ message: "Failed to activate subscription" });
  }
});

router.post("/mock/top-up", async (req: Request, res: Response) => {
  try {
    const uid = await getUid(req);
    const credits = Number(req.body?.credits);
    const amount = Number(req.body?.amount ?? 0);

    if (!uid) {
      res.status(401).json({ message: "Missing auth token" });
      return;
    }

    if (!Number.isFinite(credits) || credits < 1) {
      res.status(400).json({ message: "credits must be a positive number" });
      return;
    }

    const userSnap = await adminDb.doc(`users/${uid}`).get();
    if (userSnap.data()?.billingReviewRequired === true) {
      res.status(409).json({ message: "Credit usage is paused while billing is under review." });
      return;
    }

    const updatedSubscription = await adminDb.runTransaction(async (transaction) => {
      const subscriptionRef = userSubscriptionRef(uid);
      const subscriptionSnap = await transaction.get(subscriptionRef);

      if (!subscriptionSnap.exists) {
        throw new Error("No active subscription found.");
      }

      const subscription = subscriptionSnap.data() as UserSubscription;
      const nextSubscription: UserSubscription = {
        ...subscription,
        bonusCreditsRemaining: subscription.bonusCreditsRemaining + credits,
        bonusCreditsTotal: subscription.bonusCreditsTotal + credits,
      };

      transaction.set(
        subscriptionRef,
        { ...nextSubscription, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );

      transaction.set(paymentsCollection(uid).doc(), {
        amount,
        bonusCredits: credits,
        currency: "NOK",
        isTopUp: true,
        status: "paid",
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.set(eventsCollection(uid).doc(), {
        bonusCredits: credits,
        eventType: "credits_topped_up",
        createdAt: FieldValue.serverTimestamp(),
      });

      return nextSubscription;
    });

    res.json({ subscription: serializeSubscription(updatedSubscription) });
  } catch (error) {
    console.error("Failed to top up credits:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to top up credits",
    });
  }
});

router.post("/spend", async (req: Request, res: Response) => {
  try {
    const uid = await getUid(req);
    const credits = Number(req.body?.credits ?? 1);
    const feature = typeof req.body?.feature === "string" ? req.body.feature : "unknown";

    if (!uid) {
      res.status(401).json({ message: "Missing auth token" });
      return;
    }

    if (!Number.isFinite(credits) || credits < 1) {
      res.status(400).json({ message: "credits must be a positive number" });
      return;
    }

    const userSnap = await adminDb.doc(`users/${uid}`).get();
    if (userSnap.data()?.billingReviewRequired === true) {
      res.status(409).json({ message: "Credit usage is paused while billing is under review." });
      return;
    }

    const updatedSubscription = await adminDb.runTransaction(async (transaction) => {
      const subscriptionRef = userSubscriptionRef(uid);
      const subscriptionSnap = await transaction.get(subscriptionRef);

      if (!subscriptionSnap.exists) {
        throw new Error("No active subscription found.");
      }

      const subscription = subscriptionSnap.data() as UserSubscription;
      const totalCreditsRemaining =
        subscription.membershipCreditsRemaining + subscription.bonusCreditsRemaining;

      const canUseCredits =
        subscription.status === "active" || subscription.status === "trialing";
      if (!canUseCredits || totalCreditsRemaining < credits) {
        throw new Error("Not enough credits.");
      }

      const membershipCreditsSpent = Math.min(
        subscription.membershipCreditsRemaining,
        credits
      );
      const bonusCreditsSpent = credits - membershipCreditsSpent;
      const nextSubscription: UserSubscription = {
        ...subscription,
        bonusCreditsRemaining: subscription.bonusCreditsRemaining - bonusCreditsSpent,
        bonusCreditsUsed: subscription.bonusCreditsUsed + bonusCreditsSpent,
        membershipCreditsRemaining:
          subscription.membershipCreditsRemaining - membershipCreditsSpent,
        membershipCreditsUsed:
          subscription.membershipCreditsUsed + membershipCreditsSpent,
      };

      transaction.set(
        subscriptionRef,
        { ...nextSubscription, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );

      transaction.set(creditUsageCollection(uid).doc(), {
        bonusCreditsSpent,
        credits,
        feature,
        membershipCreditsSpent,
        remainingAfter:
          nextSubscription.membershipCreditsRemaining +
          nextSubscription.bonusCreditsRemaining,
        createdAt: FieldValue.serverTimestamp(),
      });

      return nextSubscription;
    });

    res.json({ subscription: serializeSubscription(updatedSubscription) });
  } catch (error) {
    console.error("Failed to spend credits:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Failed to spend credits",
    });
  }
});

router.post("/mock/cancel-at-period-end", async (req: Request, res: Response) => {
  try {
    const uid = await getUid(req);

    if (!uid) {
      res.status(401).json({ message: "Missing auth token" });
      return;
    }

    await userSubscriptionRef(uid).set(
      {
        cancelAtPeriodEnd: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await eventsCollection(uid).add({
      eventType: "cancel_at_period_end",
      createdAt: FieldValue.serverTimestamp(),
    });

    const subscriptionSnap = await userSubscriptionRef(uid).get();

    res.json({
      subscription: serializeSubscription(subscriptionSnap.data() as UserSubscription),
    });
  } catch (error) {
    console.error("Failed to cancel subscription:", error);
    res.status(500).json({ message: "Failed to cancel subscription" });
  }
});

export default router;
