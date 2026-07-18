import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin.js";
import {
  serializeSubscription,
  type StoredUserSubscription,
} from "./subscriptionModel.js";

export class CreditHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "CreditHttpError";
    this.statusCode = statusCode;
  }
}

function validateCreditSpendInput(credits: unknown, feature: unknown) {
  const parsedCredits = Number(credits);
  const parsedFeature = typeof feature === "string" ? feature.trim() : "";

  if (!Number.isSafeInteger(parsedCredits) || parsedCredits < 1) {
    throw new CreditHttpError("credits must be a positive integer", 400);
  }
  if (
    !parsedFeature ||
    parsedFeature.length > 100 ||
    [...parsedFeature].some((character) => {
      const characterCode = character.charCodeAt(0);
      return characterCode <= 31 || characterCode === 127;
    })
  ) {
    throw new CreditHttpError("feature must be a valid string", 400);
  }

  return { credits: parsedCredits, feature: parsedFeature };
}

function assertCreditBalance(
  subscription: StoredUserSubscription,
  credits: number,
) {
  const totalCreditsRemaining =
    Number(subscription.membershipCreditsRemaining ?? 0) +
    Number(subscription.bonusCreditsRemaining ?? 0);
  const canUseCredits =
    subscription.status === "active" || subscription.status === "trialing";

  if (!canUseCredits || totalCreditsRemaining < credits) {
    throw new CreditHttpError("Not enough credits", 409);
  }
}

async function checkUserCredits(uid: string, credits: number) {
  const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);
  const subscriptionSnap = await subscriptionRef.get();

  if (!subscriptionSnap.exists) {
    throw new CreditHttpError("No active subscription found", 409);
  }

  const subscription = subscriptionSnap.data() as StoredUserSubscription;
  assertCreditBalance(subscription, credits);
  return subscription;
}

async function deductUserCredits(
  uid: string,
  current: StoredUserSubscription,
  credits: number,
) {
  const membershipCreditsSpent = Math.min(
    Number(current.membershipCreditsRemaining ?? 0),
    credits,
  );
  const bonusCreditsSpent = credits - membershipCreditsSpent;
  const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);

  await subscriptionRef.update({
    bonusCreditsRemaining: FieldValue.increment(-bonusCreditsSpent),
    bonusCreditsUsed: FieldValue.increment(bonusCreditsSpent),
    membershipCreditsRemaining: FieldValue.increment(-membershipCreditsSpent),
    membershipCreditsUsed: FieldValue.increment(membershipCreditsSpent),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    ...current,
    bonusCreditsRemaining:
      Number(current.bonusCreditsRemaining ?? 0) - bonusCreditsSpent,
    bonusCreditsUsed: Number(current.bonusCreditsUsed ?? 0) + bonusCreditsSpent,
    membershipCreditsRemaining:
      Number(current.membershipCreditsRemaining ?? 0) - membershipCreditsSpent,
    membershipCreditsUsed:
      Number(current.membershipCreditsUsed ?? 0) + membershipCreditsSpent,
  };
}

export async function runPaidFeature<T>(
  uid: string,
  feature: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
) {
  const { credits } = validateCreditSpendInput(1, feature);
  const current = await checkUserCredits(uid, credits);

  const data = await operation();
  if (signal?.aborted) {
    throw new DOMException("The request was aborted", "AbortError");
  }
  const subscription = await deductUserCredits(uid, current, credits);
  return { data, subscription: serializeSubscription(subscription) };
}
