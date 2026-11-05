import { Router } from "express";
import rateLimit from "express-rate-limit";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAuthenticatedUid,
  requireAuthenticatedUser,
} from "../security/auth.js";
import { logError } from "../security/logging.js";
import { adminAuth, adminDb } from "../subscriptions/firebaseAdmin.js";
import { hasUncancelledStripeSubscription } from "../subscriptions/stripePayments.js";

export function createAccountRouter(
  hasUncancelledSubscription = hasUncancelledStripeSubscription,
) {
  const router = Router();
  const deleteLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyGenerator: (_req, res) => getAuthenticatedUid(res),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many account requests. Please wait and try again.",
    },
  });

  router.delete(
    "/me",
    requireAuthenticatedUser,
    deleteLimiter,
    async (_req, res) => {
      const uid = getAuthenticatedUid(res);
      const userRef = adminDb.doc(`users/${uid}`);
      try {
        const [user, subscription] = await Promise.all([
          userRef.get(),
          adminDb.doc(`users/${uid}/subscription/current`).get(),
        ]);
        const membership = subscription.data();
        const customerId =
          user.data()?.stripeCustomerId ?? membership?.stripeCustomerId;
        const hasPaidMembership =
          membership &&
          membership.planId !== "free" &&
          membership.status !== "canceled" &&
          membership.status !== "expired";
        const blocked =
          typeof customerId === "string" && customerId
            ? await hasUncancelledSubscription(customerId)
            : hasPaidMembership;
        if (blocked) {
          res.status(409).json({
            message: "Cancel your subscription before deleting your account.",
          });
          return;
        }

        await adminAuth.deleteUser(uid);
      } catch (error) {
        logError("Failed to delete account", error);
        res.status(500).json({
          message: "We couldn't delete your account. Please try again.",
        });
        return;
      }

      try {
        await userRef.set(
          {
            status: "deleted",
            deletedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch (error) {
        // Firebase deletion has succeeded; do not report the account as still active.
        logError("Failed to mark deleted account in Firestore", error);
      }
      res.json({ deleted: true });
    },
  );

  return router;
}

export default createAccountRouter();
