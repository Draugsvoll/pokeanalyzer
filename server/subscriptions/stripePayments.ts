import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import { adminAuth, adminDb } from "./firebaseAdmin.js";
import {
  getMembershipPlan,
  type MembershipPlanId,
} from "../../shared/subscriptions/plans.js";
import { AuthHttpError, getAuthenticatedUid } from "../security/auth.js";
import { logError } from "../security/logging.js";
import {
  serializeSubscription,
  type StoredUserSubscription,
} from "./subscriptionModel.js";

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

const MEMBERSHIP_PRICE_ENV: Record<Exclude<MembershipPlanId, "free">, string> = {
  collector: "STRIPE_COLLECTOR_PRICE_ID",
  pro: "STRIPE_PRO_PRICE_ID",
};

const TOP_UP_PACKAGES = {
  credits_100: {
    amount: 3.99,
    credits: 100,
    currency: "USD",
    priceEnv: "STRIPE_TOPUP_100_PRICE_ID",
  },
} as const;

type TopUpPackageId = keyof typeof TOP_UP_PACKAGES;
type StripeEventContext = Pick<Stripe.Event, "created" | "id">;

class PaymentHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new PaymentHttpError("Stripe is not configured.", 503);
  return new Stripe(secretKey);
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new PaymentHttpError("Stripe pricing is not configured.", 503);
  return value;
}

function sendPaymentError(res: Response, error: unknown, fallback: string) {
  const isSafeHttpError = error instanceof PaymentHttpError || error instanceof AuthHttpError;
  const statusCode = isSafeHttpError ? error.statusCode : 500;
  const message = isSafeHttpError ? error.message : fallback;
  res.status(statusCode).json({ message });
}

function stripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function stripeSubscriptionId(subscription: string | Stripe.Subscription) {
  return typeof subscription === "string" ? subscription : subscription.id;
}

async function findTopUpSessionForPaymentIntent(paymentIntentId: string) {
  const sessions = await getStripe().checkout.sessions.list({
    limit: 10,
    payment_intent: paymentIntentId,
  });
  for (const session of sessions.data) {
    const isTopUp =
      session.mode === "payment" &&
      session.metadata?.purchaseType === "top_up";
    if (!isTopUp) continue;

    const metadataUid = session.metadata?.firebaseUid;
    const customerUid = await findUidForCustomer(stripeCustomerId(session.customer));
    if (metadataUid && customerUid === metadataUid) {
      return { session, uid: metadataUid };
    }
  }
  return null;
}

async function getOrCreateCustomer(uid: string) {
  const stripe = getStripe();
  const userRef = adminDb.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const existingCustomerId = userSnap.data()?.stripeCustomerId;

  if (typeof existingCustomerId === "string" && existingCustomerId) {
    const existingCustomer = await stripe.customers.retrieve(existingCustomerId);
    if (!existingCustomer.deleted) {
      if (existingCustomer.metadata.firebaseUid !== uid) {
        throw new PaymentHttpError("Stripe customer ownership mismatch.", 409);
      }
      return existingCustomer.id;
    }
  }

  const authUser = await adminAuth.getUser(uid);
  const customer = await stripe.customers.create(
    {
      email: authUser.email,
      metadata: { firebaseUid: uid },
    },
    {
      idempotencyKey: `firebase-customer-${uid}-${
        typeof existingCustomerId === "string" ? existingCustomerId : "initial"
      }`,
    },
  );

  await userRef.set(
    { stripeCustomerId: customer.id, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return customer.id;
}

async function validateMembershipPrice(
  priceId: string,
  planId: Exclude<MembershipPlanId, "free">,
) {
  const plan = getMembershipPlan(planId)!;
  const price = await getStripe().prices.retrieve(priceId);
  if (
    !price.active ||
    price.currency.toUpperCase() !== plan.currency ||
    price.unit_amount !== Math.round(plan.price * 100) ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  ) {
    throw new PaymentHttpError(`Stripe price for ${plan.name} does not match the app plan.`, 503);
  }
}

async function validateTopUpPrice(priceId: string, packageId: TopUpPackageId) {
  const topUp = TOP_UP_PACKAGES[packageId];
  const price = await getStripe().prices.retrieve(priceId);
  if (
    !price.active ||
    price.currency.toUpperCase() !== topUp.currency ||
    price.unit_amount !== Math.round(topUp.amount * 100) ||
    price.recurring !== null
  ) {
    throw new PaymentHttpError("Stripe top-up price does not match the app package.", 503);
  }
}

async function getMembershipCheckoutRequestId(
  uid: string,
  planId: Exclude<MembershipPlanId, "free">,
) {
  const attemptRef = adminDb.doc(`users/${uid}/stripe_checkout_attempts/membership`);
  const now = Date.now();

  return adminDb.runTransaction(async (transaction) => {
    const attemptSnap = await transaction.get(attemptRef);
    const attempt = attemptSnap.data();
    const expiresAt = attempt?.expiresAt?.toMillis?.() ?? 0;

    if (expiresAt > now && typeof attempt?.requestId === "string") {
      if (attempt.planId !== planId) {
        throw new PaymentHttpError("A membership checkout is already being created.", 409);
      }
      return attempt.requestId as string;
    }

    const requestId = randomUUID();
    transaction.set(attemptRef, {
      expiresAt: Timestamp.fromMillis(now + 2 * 60 * 1000),
      planId,
      requestId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return requestId;
  });
}

function getPlanId(subscription: Stripe.Subscription): MembershipPlanId | null {
  const priceId = subscription.items.data[0]?.price.id;
  const planEntry = Object.entries(MEMBERSHIP_PRICE_ENV).find(
    ([, envName]) => process.env[envName] === priceId,
  );
  return planEntry ? planEntry[0] as MembershipPlanId : null;
}

function getPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    currentPeriodEnd: item?.current_period_end
      ? Timestamp.fromMillis(item.current_period_end * 1000)
      : null,
    currentPeriodStart: item?.current_period_start
      ? Timestamp.fromMillis(item.current_period_start * 1000)
      : null,
  };
}

function mapStatus(status: Stripe.Subscription.Status) {
  if (status === "active" || status === "trialing") return status;
  if (status === "paused") return "paused" as const;
  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    return "past_due" as const;
  }
  if (status === "canceled") return "canceled" as const;
  return "expired" as const;
}

async function findUidForSubscription(subscription: Stripe.Subscription) {
  const metadataUid = subscription.metadata.firebaseUid;
  const customerId = stripeCustomerId(subscription.customer);
  if (metadataUid) {
    const userSnap = await adminDb.doc(`users/${metadataUid}`).get();
    const storedCustomerId = userSnap.data()?.stripeCustomerId;
    if (!storedCustomerId || storedCustomerId === customerId) return metadataUid;
    throw new Error(`Stripe customer mismatch on subscription ${subscription.id}`);
  }

  if (!customerId) return null;

  const users = await adminDb
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  return users.empty ? null : users.docs[0].id;
}

async function findUidForCustomer(customerId: string | null) {
  if (!customerId) return null;
  const users = await adminDb
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  return users.empty ? null : users.docs[0].id;
}

async function recordUnmanagedStripeObject(
  objectType: string,
  objectId: string,
  details: Record<string, unknown> = {},
) {
  await adminDb.doc(`stripe_billing_alerts/unmanaged-${objectType}-${objectId}`).set(
    {
      ...details,
      eventType: `unmanaged_${objectType}`,
      objectId,
      objectType,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function downgradeSubscriptionToFree(
  subscription: Stripe.Subscription,
  eventContext?: StripeEventContext,
) {
  const uid = await findUidForSubscription(subscription);
  if (!uid) {
    await recordUnmanagedStripeObject("subscription", subscription.id, {
      status: subscription.status,
      stripeCustomerId: stripeCustomerId(subscription.customer),
    });
    return;
  }

  const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);
  const endedEventRef = adminDb.doc(
    `users/${uid}/subscription_events/stripe-ended-${subscription.id}`,
  );
  await adminDb.runTransaction(async (transaction) => {
    const currentSnap = await transaction.get(subscriptionRef);
    const current = currentSnap.data();
    const currentSubscriptionId = current?.stripeSubscriptionId;
    const latestEventCreated = Number(current?.latestStripeEventCreated ?? 0);

    if (
      (typeof currentSubscriptionId === "string" &&
        currentSubscriptionId !== subscription.id) ||
      (!currentSubscriptionId && current?.lastStripeSubscriptionId === subscription.id) ||
      (eventContext && latestEventCreated > eventContext.created)
    ) {
      return;
    }

    transaction.set(subscriptionRef, {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: FieldValue.delete(),
      currentPeriodStart: FieldValue.delete(),
      lastStripeSubscriptionId: subscription.id,
      ...(eventContext && {
        latestStripeEventCreated: eventContext.created,
        latestStripeEventId: eventContext.id,
      }),
      membershipCreditsRemaining: 0,
      membershipCreditsTotal: 0,
      membershipCreditsUsed: 0,
      planId: "free",
      planName: "Free",
      status: "active",
      stripePriceId: FieldValue.delete(),
      stripeSubscriptionId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(endedEventRef, {
      eventType: "stripe_subscription_ended",
      previousStripeSubscriptionId: subscription.id,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

async function syncSubscription(
  subscription: Stripe.Subscription,
  eventContext?: StripeEventContext,
) {
  if (
    subscription.status === "canceled" ||
    subscription.status === "incomplete_expired"
  ) {
    await downgradeSubscriptionToFree(subscription, eventContext);
    return;
  }

  const uid = await findUidForSubscription(subscription);
  const planId = getPlanId(subscription);
  const plan = planId ? getMembershipPlan(planId) : null;
  if (!uid) {
    await recordUnmanagedStripeObject("subscription", subscription.id, {
      status: subscription.status,
      stripeCustomerId: stripeCustomerId(subscription.customer),
      stripePriceId: subscription.items.data[0]?.price.id ?? null,
    });
    return;
  }
  if (!plan) {
    await Promise.all([
      adminDb.doc(`users/${uid}`).set(
        { billingReviewRequired: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
      adminDb.doc(`users/${uid}/billing_alerts/unknown-plan-${subscription.id}`).set({
        eventType: "unknown_stripe_plan",
        stripePriceId: subscription.items.data[0]?.price.id ?? null,
        stripeSubscriptionId: subscription.id,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);
    throw new Error(`No app plan matches Stripe subscription ${subscription.id}`);
  }

  const customerId = stripeCustomerId(subscription.customer);
  const period = getPeriod(subscription);

  await adminDb.doc(`users/${uid}`).set(
    {
      ...(customerId && { stripeCustomerId: customerId }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);
  await adminDb.runTransaction(async (transaction) => {
    const currentSnap = await transaction.get(subscriptionRef);
    const current = currentSnap.data();
    const currentSubscriptionId = current?.stripeSubscriptionId;
    const currentStatus = current?.status;
    const canReplaceEndedSubscription =
      currentStatus === "canceled" || currentStatus === "expired";
    const latestEventCreated = Number(current?.latestStripeEventCreated ?? 0);

    if (
      typeof currentSubscriptionId === "string" &&
      currentSubscriptionId !== subscription.id &&
      !canReplaceEndedSubscription
    ) {
      if (eventContext) {
        transaction.set(adminDb.doc(`users/${uid}/billing_alerts/${eventContext.id}`), {
          eventType: "stale_or_conflicting_subscription_event",
          ignoredStripeSubscriptionId: subscription.id,
          activeStripeSubscriptionId: currentSubscriptionId,
          stripeEventId: eventContext.id,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return;
    }

    if (
      (!currentSubscriptionId && current?.lastStripeSubscriptionId === subscription.id) ||
      (eventContext &&
        currentSubscriptionId === subscription.id &&
        latestEventCreated > eventContext.created)
    ) {
      return;
    }

    const currentCreditsTotal = Number(current?.membershipCreditsTotal ?? 0);
    const currentCreditsUsed = Number(current?.membershipCreditsUsed ?? 0);
    const isDowngrade = plan.credits < currentCreditsTotal;
    const cappedCreditsUsed = Math.min(currentCreditsUsed, plan.credits);

    transaction.set(subscriptionRef, {
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...period,
      ...(isDowngrade && {
        membershipCreditsRemaining: Math.max(plan.credits - cappedCreditsUsed, 0),
        membershipCreditsTotal: plan.credits,
        membershipCreditsUsed: cappedCreditsUsed,
      }),
      planId: plan.id,
      planName: plan.name,
      ...(eventContext && {
        latestStripeEventCreated: eventContext.created,
        latestStripeEventId: eventContext.id,
      }),
      status: mapStatus(subscription.status),
      stripePriceId: subscription.items.data[0]?.price.id ?? null,
      stripeSubscriptionId: subscription.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function grantMembershipCredits(subscription: Stripe.Subscription, invoice: Stripe.Invoice) {
  const uid = await findUidForSubscription(subscription);
  const planId = getPlanId(subscription);
  const plan = planId ? getMembershipPlan(planId) : null;
  if (!uid) {
    await recordUnmanagedStripeObject("invoice", invoice.id, {
      stripeSubscriptionId: subscription.id,
    });
    return;
  }
  if (!plan) throw new Error(`No app plan matches invoice ${invoice.id}`);

  await adminDb.runTransaction(async (transaction) => {
    const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);
    const paymentRef = adminDb.doc(`users/${uid}/payments/${invoice.id}`);
    const [subscriptionSnap, paymentSnap] = await Promise.all([
      transaction.get(subscriptionRef),
      transaction.get(paymentRef),
    ]);
    if (paymentSnap.exists) return;

    const current = subscriptionSnap.data();
    const isNewCycle =
      invoice.billing_reason === "subscription_create" ||
      invoice.billing_reason === "subscription_cycle";
    const isPlanChange = invoice.billing_reason === "subscription_update";
    const currentCreditsUsed = Number(current?.membershipCreditsUsed ?? 0);
    const adjustedCreditsUsed = Math.min(currentCreditsUsed, plan.credits);
    const latestInvoiceCreated = Number(current?.latestMembershipInvoiceCreated ?? 0);
    const appliesToCurrentSubscription =
      current?.stripeSubscriptionId === subscription.id &&
      latestInvoiceCreated <= invoice.created;
    const shouldAdjustCredits = appliesToCurrentSubscription && (isNewCycle || isPlanChange);

    if (shouldAdjustCredits) {
      transaction.set(subscriptionRef, {
        membershipCreditsRemaining: plan.credits,
        membershipCreditsTotal: plan.credits,
        membershipCreditsUsed: isNewCycle ? 0 : adjustedCreditsUsed,
        ...(isPlanChange && {
          membershipCreditsRemaining: Math.max(plan.credits - adjustedCreditsUsed, 0),
        }),
        latestMembershipInvoiceCreated: invoice.created,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    transaction.set(paymentRef, {
      amount: invoice.amount_paid / 100,
      credits: shouldAdjustCredits ? plan.credits : 0,
      currency: invoice.currency.toUpperCase(),
      invoiceId: invoice.id,
      billingReason: invoice.billing_reason,
      creditsApplied: shouldAdjustCredits,
      isTopUp: false,
      planId: plan.id,
      status: "paid",
      stripeSubscriptionId: subscription.id,
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.set(adminDb.collection(`users/${uid}/subscription_events`).doc(), {
      credits: shouldAdjustCredits ? plan.credits : 0,
      creditsApplied: shouldAdjustCredits,
      eventType: "stripe_invoice_paid",
      billingReason: invoice.billing_reason,
      invoiceId: invoice.id,
      planId: plan.id,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

async function grantTopUp(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;

  const uid = session.metadata?.firebaseUid;
  const credits = Number(session.metadata?.credits);
  const packageId = session.metadata?.packageId as TopUpPackageId | undefined;
  const topUp = packageId ? TOP_UP_PACKAGES[packageId] : undefined;
  const customerId = stripeCustomerId(session.customer);
  const customerUid = await findUidForCustomer(customerId);
  const expectedAmount = topUp?.amount ? Math.round(topUp.amount * 100) : 0;
  const expectedCurrency = topUp?.currency ?? "";
  if (
    !uid ||
    !topUp ||
    credits !== topUp.credits ||
    session.amount_total !== expectedAmount ||
    session.currency?.toUpperCase() !== expectedCurrency ||
    customerUid !== uid
  ) {
    throw new Error(`Invalid paid top-up session ${session.id}`);
  }

  await adminDb.runTransaction(async (transaction) => {
    const userRef = adminDb.doc(`users/${uid}`);
    const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);
    const paymentRef = adminDb.doc(`users/${uid}/payments/${session.id}`);
    const reversalRef = adminDb.doc(`users/${uid}/topup_reversals/${session.id}`);
    const [userSnap, subscriptionSnap, paymentSnap, reversalSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(subscriptionRef),
      transaction.get(paymentRef),
      transaction.get(reversalRef),
    ]);

    if (paymentSnap.exists) return;
    const current = subscriptionSnap.data();
    const subscriptionExists = subscriptionSnap.exists;
    const creditsReversed = Math.min(
      Number(reversalSnap.data()?.creditsReversed ?? 0),
      credits,
    );
    const billingHold = userSnap.data()?.billingReviewRequired === true;
    const creditsToGrant = billingHold ? 0 : Math.max(credits - creditsReversed, 0);
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

    transaction.set(
      subscriptionRef,
      {
        ...(!subscriptionExists && {
          cancelAtPeriodEnd: false,
          membershipCreditsRemaining: 0,
          membershipCreditsTotal: 0,
          membershipCreditsUsed: 0,
          planId: "free",
          planName: "Free",
          status: "active",
        }),
        bonusCreditsRemaining:
          Number(current?.bonusCreditsRemaining ?? 0) + creditsToGrant,
        bonusCreditsTotal: Number(current?.bonusCreditsTotal ?? 0) + creditsToGrant,
        bonusCreditsUsed: Number(current?.bonusCreditsUsed ?? 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(paymentRef, {
      amount: Number(session.amount_total ?? 0) / 100,
      bonusCredits: creditsToGrant,
      checkoutSessionId: session.id,
      creditsReversed,
      currency: session.currency?.toUpperCase() ?? "NOK",
      isTopUp: true,
      originalBonusCredits: credits,
      paymentIntentId,
      status: billingHold
        ? "held_for_review"
        : creditsReversed >= credits
          ? "refunded"
          : creditsReversed > 0
            ? "partially_refunded"
            : "paid",
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.set(adminDb.collection(`users/${uid}/subscription_events`).doc(), {
      bonusCredits: creditsToGrant,
      checkoutSessionId: session.id,
      creditsReversed,
      eventType: "stripe_credits_topped_up",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

async function getInvoiceSubscription(invoice: Stripe.Invoice) {
  const subscriptionDetails = invoice.parent?.subscription_details;
  if (!subscriptionDetails) return null;
  const subscriptionId = stripeSubscriptionId(subscriptionDetails.subscription);
  return getStripe().subscriptions.retrieve(subscriptionId);
}

async function recordBillingAlert(
  event: Stripe.Event,
  customerId: string | null,
  details: Record<string, unknown>,
  holdAccount = true,
  resolvedUid?: string | null,
) {
  const uid = resolvedUid ?? await findUidForCustomer(customerId);
  const alertData = {
    ...details,
    eventType: event.type,
    stripeEventId: event.id,
    createdAt: FieldValue.serverTimestamp(),
  };

  if (uid) {
    const writes: Promise<unknown>[] = [
      adminDb.doc(`users/${uid}/billing_alerts/${event.id}`).set(alertData),
    ];
    if (holdAccount) {
      writes.push(adminDb.doc(`users/${uid}`).set(
        { billingReviewRequired: true, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ));
    }
    await Promise.all(writes);
    return;
  }

  await adminDb.doc(`stripe_billing_alerts/${event.id}`).set(alertData);
}

async function reverseTopUpCredits(
  uid: string,
  session: Stripe.Checkout.Session,
  eventId: string,
  refundedAmount: number,
  currency: string,
) {
  const originalCredits = Number(session.metadata?.credits ?? 0);
  const originalAmount = Number(session.amount_total ?? 0);
  if (
    !Number.isSafeInteger(originalCredits) ||
    originalCredits < 1 ||
    !Number.isSafeInteger(refundedAmount) ||
    refundedAmount < 1 ||
    originalAmount < 1 ||
    session.currency?.toUpperCase() !== currency.toUpperCase()
  ) {
    return;
  }

  const requestedReversal = Math.min(
    Math.ceil((originalCredits * refundedAmount) / originalAmount),
    originalCredits,
  );
  const reversalRef = adminDb.doc(`users/${uid}/topup_reversals/${session.id}`);
  const adjustmentRef = adminDb.doc(`users/${uid}/credit_adjustments/${eventId}`);
  const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);
  const paymentRef = adminDb.doc(`users/${uid}/payments/${session.id}`);

  await adminDb.runTransaction(async (transaction) => {
    const [reversalSnap, adjustmentSnap, subscriptionSnap, paymentSnap] =
      await Promise.all([
        transaction.get(reversalRef),
        transaction.get(adjustmentRef),
        transaction.get(subscriptionRef),
        transaction.get(paymentRef),
      ]);

    if (adjustmentSnap.exists) return;

    const alreadyReversed = Number(reversalSnap.data()?.creditsReversed ?? 0);
    const additionalReversal = Math.max(
      Math.min(requestedReversal, originalCredits - alreadyReversed),
      0,
    );
    const nextReversed = alreadyReversed + additionalReversal;
    const payment = paymentSnap.data();
    const current = subscriptionSnap.data();
    const grantedCreditsRemaining = Math.max(Number(payment?.bonusCredits ?? 0), 0);
    const availableBonusCredits = Math.max(Number(current?.bonusCreditsRemaining ?? 0), 0);
    const creditsRemoved = paymentSnap.exists && subscriptionSnap.exists
      ? Math.min(additionalReversal, grantedCreditsRemaining, availableBonusCredits)
      : 0;
    const creditDebt = paymentSnap.exists ? additionalReversal - creditsRemoved : 0;

    transaction.set(
      reversalRef,
      {
        checkoutSessionId: session.id,
        creditsReversed: nextReversed,
        originalCredits,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(adjustmentRef, {
      checkoutSessionId: session.id,
      creditDebt,
      creditsRemoved,
      creditsReversed: additionalReversal,
      eventId,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (paymentSnap.exists) {
      transaction.set(
        paymentRef,
        {
          bonusCredits: Math.max(grantedCreditsRemaining - additionalReversal, 0),
          creditsReversed: nextReversed,
          refundedAmount: FieldValue.increment(refundedAmount / 100),
          status: nextReversed >= originalCredits ? "refunded" : "partially_refunded",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (subscriptionSnap.exists && creditsRemoved > 0) {
      transaction.set(
        subscriptionRef,
        {
          bonusCreditsRemaining: availableBonusCredits - creditsRemoved,
          bonusCreditsTotal: Math.max(
            Number(current?.bonusCreditsTotal ?? 0) - creditsRemoved,
            Number(current?.bonusCreditsUsed ?? 0),
          ),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    if (creditDebt > 0) {
      transaction.set(
        adminDb.doc(`users/${uid}`),
        {
          billingReviewRequired: true,
          creditDebt: FieldValue.increment(creditDebt),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    transaction.set(adminDb.collection(`users/${uid}/subscription_events`).doc(), {
      checkoutSessionId: session.id,
      creditDebt,
      creditsRemoved,
      creditsReversed: additionalReversal,
      eventType: "stripe_topup_reversed",
      stripeEventId: eventId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

async function handleRefund(event: Stripe.Event & { data: { object: Stripe.Refund } }) {
  const refund = event.data.object;
  const paymentIntentId = typeof refund.payment_intent === "string"
    ? refund.payment_intent
    : refund.payment_intent?.id;
  const paymentIntent = paymentIntentId
    ? await getStripe().paymentIntents.retrieve(paymentIntentId)
    : null;
  const topUpSession = paymentIntentId
    ? await findTopUpSessionForPaymentIntent(paymentIntentId)
    : null;
  if (topUpSession) {
    await reverseTopUpCredits(
      topUpSession.uid,
      topUpSession.session,
      event.id,
      refund.amount,
      refund.currency,
    );
  }
  await recordBillingAlert(event, stripeCustomerId(paymentIntent?.customer ?? null), {
    amount: refund.amount / 100,
    currency: refund.currency.toUpperCase(),
    refundId: refund.id,
    status: refund.status,
  }, true, topUpSession?.uid);
}

async function handleDispute(event: Stripe.Event & { data: { object: Stripe.Dispute } }) {
  const dispute = event.data.object;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const charge = await getStripe().charges.retrieve(chargeId);
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  const topUpSession = paymentIntentId
    ? await findTopUpSessionForPaymentIntent(paymentIntentId)
    : null;
  if (topUpSession) {
    await reverseTopUpCredits(
      topUpSession.uid,
      topUpSession.session,
      event.id,
      dispute.amount,
      dispute.currency,
    );
  }
  await recordBillingAlert(event, stripeCustomerId(charge.customer), {
    amount: dispute.amount / 100,
    currency: dispute.currency.toUpperCase(),
    disputeId: dispute.id,
    reason: dispute.reason,
    status: dispute.status,
  }, true, topUpSession?.uid);
}

async function processStripeEvent(event: Stripe.Event) {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    if (
      session.mode === "payment" &&
      session.metadata?.purchaseType === "top_up"
    ) {
      await grantTopUp(session);
    }
    return;
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await recordBillingAlert(event, stripeCustomerId(event.data.object.customer), {
      checkoutSessionId: event.data.object.id,
      status: "payment_failed",
    }, false);
    return;
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const subscription = await getInvoiceSubscription(invoice);
    if (subscription) {
      await syncSubscription(subscription, event);
      if (
        subscription.status !== "canceled" &&
        subscription.status !== "incomplete_expired"
      ) {
        await grantMembershipCredits(subscription, invoice);
      }
    }
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const subscription = await getInvoiceSubscription(event.data.object);
    if (subscription) await syncSubscription(subscription, event);
    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await syncSubscription(event.data.object, event);
    return;
  }

  if (event.type === "refund.created") {
    await handleRefund(event);
    return;
  }

  if (event.type === "charge.dispute.created") {
    await handleDispute(event);
  }
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  try {
    const signature = req.header("stripe-signature");
    if (!signature) {
      res.status(400).send("Missing Stripe signature");
      return;
    }

    const event = getStripe().webhooks.constructEvent(
      req.body,
      signature,
      getRequiredEnv("STRIPE_WEBHOOK_SECRET"),
    );

    const eventRef = adminDb.doc(`stripe_events/${event.id}`);
    if ((await eventRef.get()).exists) {
      res.json({ received: true, duplicate: true });
      return;
    }

    await processStripeEvent(event);
    await eventRef.set({ type: event.type, processedAt: FieldValue.serverTimestamp() });
    res.json({ received: true });
  } catch (error) {
    logError("Stripe webhook failed", error);
    res.status(400).send("Webhook failed");
  }
}

export async function createMembershipCheckout(req: Request, res: Response) {
  try {
    const uid = getAuthenticatedUid(res);
    const requestedPlanId: unknown = req.body?.planId;
    if (requestedPlanId !== "collector" && requestedPlanId !== "pro") {
      throw new PaymentHttpError("Invalid paid plan", 400);
    }
    const planId: Exclude<MembershipPlanId, "free"> = requestedPlanId;

    const userSnap = await adminDb.doc(`users/${uid}`).get();
    if (userSnap.data()?.billingReviewRequired === true) {
      throw new PaymentHttpError("Payments are paused while billing is under review.", 409);
    }

    const customer = await getOrCreateCustomer(uid);
    const subscriptions = await getStripe().subscriptions.list({
      customer,
      limit: 100,
      status: "all",
    });
    const blockingStatuses: Stripe.Subscription.Status[] = [
      "active",
      "incomplete",
      "past_due",
      "paused",
      "trialing",
      "unpaid",
    ];
    if (subscriptions.data.some((subscription) => blockingStatuses.includes(subscription.status))) {
      throw new PaymentHttpError(
        "Manage your existing plan before starting another subscription.",
        409,
      );
    }

    const priceId = getRequiredEnv(MEMBERSHIP_PRICE_ENV[planId]);
    await validateMembershipPrice(priceId, planId);
    const requestId = await getMembershipCheckoutRequestId(uid, planId);
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: uid,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { firebaseUid: uid, planId, purchaseType: "membership" },
        subscription_data: { metadata: { firebaseUid: uid, planId } },
        success_url: `${APP_URL}/profile?checkout=success`,
        cancel_url: `${APP_URL}/profile?checkout=canceled`,
      },
      { idempotencyKey: `membership-checkout-${requestId}` },
    );
    if (!session.url) {
      throw new PaymentHttpError("Stripe did not return a checkout URL.", 502);
    }

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    logError("Failed to create Stripe checkout", error);
    sendPaymentError(res, error, "Checkout failed");
  }
}

export async function createTopUpCheckout(req: Request, res: Response) {
  try {
    const uid = getAuthenticatedUid(res);
    const packageId = req.body?.packageId as TopUpPackageId | undefined;
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
    if (!packageId || !(packageId in TOP_UP_PACKAGES)) {
      throw new PaymentHttpError("Invalid top-up package", 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new PaymentHttpError("Invalid checkout request ID", 400);
    }

    const subscriptionSnap = await adminDb.doc(`users/${uid}/subscription/current`).get();
    const subscriptionStatus = subscriptionSnap.data()?.status;
    if (
      !subscriptionSnap.exists ||
      (subscriptionStatus !== "active" && subscriptionStatus !== "trialing")
    ) {
      throw new PaymentHttpError("An active membership is required for credit top-ups.", 409);
    }

    const userSnap = await adminDb.doc(`users/${uid}`).get();
    if (userSnap.data()?.billingReviewRequired === true) {
      throw new PaymentHttpError("Payments are paused while billing is under review.", 409);
    }

    const topUp = TOP_UP_PACKAGES[packageId];
    const customer = await getOrCreateCustomer(uid);
    const priceId = getRequiredEnv(topUp.priceEnv);
    await validateTopUpPrice(priceId, packageId);
    const metadata = {
      credits: String(topUp.credits),
      firebaseUid: uid,
      packageId,
      purchaseType: "top_up",
    };
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        customer,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        payment_intent_data: { metadata },
        success_url: `${APP_URL}/profile?checkout=success`,
        cancel_url: `${APP_URL}/profile?checkout=canceled`,
      },
      { idempotencyKey: `top-up-checkout-${uid}-${requestId}` },
    );
    if (!session.url) {
      throw new PaymentHttpError("Stripe did not return a checkout URL.", 502);
    }

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    logError("Failed to create top-up checkout", error);
    sendPaymentError(res, error, "Checkout failed");
  }
}

export async function createBillingPortal(_req: Request, res: Response) {
  try {
    const uid = getAuthenticatedUid(res);

    const customer = await getOrCreateCustomer(uid);
    const session = await getStripe().billingPortal.sessions.create({
      customer,
      return_url: `${APP_URL}/profile`,
    });
    res.json({ portalUrl: session.url });
  } catch (error) {
    logError("Failed to create billing portal", error);
    sendPaymentError(res, error, "Portal failed");
  }
}

export async function cancelStripeSubscriptionAtPeriodEnd(_req: Request, res: Response) {
  try {
    const uid = getAuthenticatedUid(res);

    const subscriptionRef = adminDb.doc(`users/${uid}/subscription/current`);
    const subscriptionSnap = await subscriptionRef.get();
    const subscriptionId = subscriptionSnap.data()?.stripeSubscriptionId;
    if (typeof subscriptionId !== "string") {
      throw new PaymentHttpError("No Stripe subscription found", 400);
    }

    const existingSubscription = await getStripe().subscriptions.retrieve(subscriptionId);
    if ((await findUidForSubscription(existingSubscription)) !== uid) {
      throw new PaymentHttpError("Stripe subscription ownership mismatch.", 403);
    }

    const subscription = await getStripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    await syncSubscription(subscription);

    const updatedSnap = await subscriptionRef.get();
    const data = updatedSnap.data();
    res.json({
      subscription: data
        ? serializeSubscription(data as StoredUserSubscription)
        : null,
    });
  } catch (error) {
    logError("Failed to cancel Stripe subscription", error);
    sendPaymentError(res, error, "Cancellation failed");
  }
}
