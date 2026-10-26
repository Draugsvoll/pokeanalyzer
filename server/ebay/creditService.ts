import type { Transaction } from "firebase-admin/firestore";
import {
  EBAY_REQUEST_CREDIT_COST,
  EBAY_SIGNUP_CREDITS,
  type EbayCredits,
} from "../../shared/ebayCredits.js";
import {
  FREE_MEMBERSHIP_PLAN,
  getMembershipPlan,
} from "../../shared/subscriptions/plans.js";
import { adminAuth, adminDb } from "../subscriptions/firebaseAdmin.js";
import type { StoredUserSubscription } from "../subscriptions/subscriptionModel.js";

const SIGNUP_GRANT_WINDOW_MS = 10 * 60 * 1000;

type StoredEbayCredits = Omit<EbayCredits, "currentPeriodEnd"> & {
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
};

type CreditReservation = {
  membershipCredits: number;
  bonusCredits: number;
  currentPeriodStart: string | null;
  credits: EbayCredits;
};

export class EbayCreditError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "EbayCreditError";
    this.statusCode = statusCode;
  }
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("The request was aborted", "AbortError");
  }
}

function serializeCredits(stored: StoredEbayCredits): EbayCredits {
  return {
    unlimited: stored.unlimited === true,
    membershipCreditsRemaining: stored.membershipCreditsRemaining,
    membershipCreditsTotal: stored.membershipCreditsTotal,
    membershipCreditsUsed: stored.membershipCreditsUsed,
    bonusCreditsRemaining: stored.bonusCreditsRemaining,
    bonusCreditsTotal: stored.bonusCreditsTotal,
    bonusCreditsUsed: stored.bonusCreditsUsed,
    creditsRemaining: stored.creditsRemaining,
    planId: stored.planId,
    ...(stored.currentPeriodEnd && {
      currentPeriodEnd: stored.currentPeriodEnd,
    }),
    version: stored.version,
  };
}

function updateBalances(credits: StoredEbayCredits): StoredEbayCredits {
  const membershipCreditsRemaining = Math.max(
    0,
    credits.membershipCreditsTotal - credits.membershipCreditsUsed,
  );
  const bonusCreditsRemaining = Math.max(
    0,
    credits.bonusCreditsTotal - credits.bonusCreditsUsed,
  );
  return {
    ...credits,
    membershipCreditsRemaining,
    bonusCreditsRemaining,
    creditsRemaining: membershipCreditsRemaining + bonusCreditsRemaining,
  };
}

function reconcileCredits(
  stored: StoredEbayCredits | undefined,
  subscription: StoredUserSubscription | undefined,
): StoredEbayCredits {
  const plan = getMembershipPlan(subscription?.planId) ?? FREE_MEMBERSHIP_PLAN;
  const periodStart = subscription?.currentPeriodStart?.toDate();
  const periodEnd = subscription?.currentPeriodEnd?.toDate();
  const currentPeriodStart =
    periodStart && Number.isFinite(periodStart.getTime())
      ? periodStart.toISOString()
      : null;
  const currentPeriodEnd =
    periodEnd && Number.isFinite(periodEnd.getTime())
      ? periodEnd.toISOString()
      : null;
  const now = Date.now();
  const hasPaidPeriod =
    plan.id !== "free" &&
    (subscription?.status === "active" ||
      subscription?.status === "trialing") &&
    currentPeriodStart !== null &&
    currentPeriodEnd !== null &&
    periodStart!.getTime() <= now &&
    periodEnd!.getTime() > now;
  const samePeriod = stored?.currentPeriodStart === currentPeriodStart;

  return updateBalances({
    unlimited: hasPaidPeriod && plan.ebayCredits === null,
    planId: plan.id,
    currentPeriodStart,
    currentPeriodEnd,
    membershipCreditsTotal: hasPaidPeriod ? (plan.ebayCredits ?? 0) : 0,
    // Keep spending when a plan changes within the same billing period.
    membershipCreditsUsed: samePeriod ? stored.membershipCreditsUsed : 0,
    bonusCreditsTotal: stored?.bonusCreditsTotal ?? 0,
    bonusCreditsUsed: stored?.bonusCreditsUsed ?? 0,
    membershipCreditsRemaining: 0,
    bonusCreditsRemaining: 0,
    creditsRemaining: 0,
    version: stored?.version ?? 0,
  });
}

async function readCredits(transaction: Transaction, uid: string) {
  const creditsRef = adminDb.doc(`users/${uid}/ebay_credits/current`);
  const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);
  const [creditsSnap, subscriptionSnap] = await Promise.all([
    transaction.get(creditsRef),
    transaction.get(subscriptionRef),
  ]);
  const stored = creditsSnap.data() as StoredEbayCredits | undefined;
  const subscription = subscriptionSnap.data() as
    StoredUserSubscription | undefined;
  return {
    creditsRef,
    stored,
    current: reconcileCredits(stored, subscription),
  };
}

function hasChanged(
  stored: StoredEbayCredits | undefined,
  current: StoredEbayCredits,
) {
  return (
    !stored ||
    Object.keys(current).some(
      (key) =>
        stored[key as keyof StoredEbayCredits] !==
        current[key as keyof StoredEbayCredits],
    )
  );
}

export async function getEbayCredits(uid: string): Promise<EbayCredits> {
  return adminDb.runTransaction(async (transaction) => {
    const { creditsRef, stored, current } = await readCredits(transaction, uid);
    if (hasChanged(stored, current)) {
      current.version += 1;
      transaction.set(creditsRef, current);
    }
    return serializeCredits(current);
  });
}

export async function grantEbaySignupCredits(
  uid: string,
): Promise<EbayCredits> {
  const account = await adminAuth.getUser(uid);
  const createdAt = Date.parse(account.metadata.creationTime);

  return adminDb.runTransaction(async (transaction) => {
    const { creditsRef, stored, current } = await readCredits(transaction, uid);
    if (current.bonusCreditsTotal === 0) {
      const accountAge = Date.now() - createdAt;
      if (
        !Number.isFinite(accountAge) ||
        accountAge < 0 ||
        accountAge > SIGNUP_GRANT_WINDOW_MS
      ) {
        throw new EbayCreditError(
          "Signup Ebay credits are only available for newly created accounts",
          403,
        );
      }
      // The balance endpoint may already have created a zero-bonus document.
      current.bonusCreditsTotal = EBAY_SIGNUP_CREDITS;
    }

    const credits = updateBalances(current);
    if (hasChanged(stored, credits)) {
      credits.version += 1;
      transaction.set(creditsRef, credits);
    }
    return serializeCredits(credits);
  });
}

async function reserveCredit(
  uid: string,
  signal?: AbortSignal,
): Promise<CreditReservation> {
  return adminDb.runTransaction(async (transaction) => {
    const { creditsRef, current } = await readCredits(transaction, uid);
    assertNotAborted(signal);
    if (current.unlimited) {
      current.version += 1;
      transaction.set(creditsRef, current);
      return {
        membershipCredits: 0,
        bonusCredits: 0,
        currentPeriodStart: current.currentPeriodStart,
        credits: serializeCredits(current),
      };
    }
    if (current.creditsRemaining < EBAY_REQUEST_CREDIT_COST) {
      throw new EbayCreditError("Not enough Ebay credits", 409);
    }
    const membershipCredits = Math.min(
      current.membershipCreditsRemaining,
      EBAY_REQUEST_CREDIT_COST,
    );
    const bonusCredits = EBAY_REQUEST_CREDIT_COST - membershipCredits;
    const reserved = updateBalances({
      ...current,
      membershipCreditsUsed: current.membershipCreditsUsed + membershipCredits,
      bonusCreditsUsed: current.bonusCreditsUsed + bonusCredits,
      version: current.version + 1,
    });
    transaction.set(creditsRef, reserved);
    return {
      membershipCredits,
      bonusCredits,
      currentPeriodStart: current.currentPeriodStart,
      credits: serializeCredits(reserved),
    };
  });
}

async function refundCredit(uid: string, reservation: CreditReservation) {
  await adminDb.runTransaction(async (transaction) => {
    const { creditsRef, current } = await readCredits(transaction, uid);
    // An old request must not refund spending from a newer monthly allowance.
    const membershipCredits =
      current.currentPeriodStart === reservation.currentPeriodStart
        ? reservation.membershipCredits
        : 0;
    transaction.set(
      creditsRef,
      updateBalances({
        ...current,
        membershipCreditsUsed: Math.max(
          0,
          current.membershipCreditsUsed - membershipCredits,
        ),
        bonusCreditsUsed: Math.max(
          0,
          current.bonusCreditsUsed - reservation.bonusCredits,
        ),
        version: current.version + 1,
      }),
    );
  });
}

export async function runEbayFeature<T>(
  uid: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
  options: {
    hasSucceeded?: () => boolean;
    onReserved?: (credits: EbayCredits) => void;
  } = {},
): Promise<{ data: T; credits: EbayCredits }> {
  assertNotAborted(signal);
  const reservation = await reserveCredit(uid, signal);
  try {
    assertNotAborted(signal);
    options.onReserved?.(reservation.credits);
    const data = await operation();
    assertNotAborted(signal);
    const credits = await getEbayCredits(uid);
    assertNotAborted(signal);
    return { data, credits };
  } catch (error) {
    if (!options.hasSucceeded?.()) await refundCredit(uid, reservation);
    throw error;
  }
}
