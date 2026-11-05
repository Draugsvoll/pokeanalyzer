import assert from "node:assert/strict";
import { once } from "node:events";
import test, { type TestContext } from "node:test";
import express from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import type Stripe from "stripe";
import { adminAuth, adminDb } from "../subscriptions/firebaseAdmin.js";
import { hasUncancelledStripeSubscription } from "../subscriptions/stripePayments.js";
import { createAccountRouter } from "./accountRoutes.js";

async function setup(
  t: TestContext,
  options: {
    user?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    blocked?: boolean;
    billingError?: boolean;
    deleteError?: boolean;
    writeError?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const verify = t.mock.method(
    adminAuth,
    "verifyIdToken",
    async (token: string) => {
      if (token !== "valid") throw new Error("Invalid token");
      // No recent-authentication or email-verification requirement for deletion.
      return {
        uid: "user-1",
        email_verified: false,
        auth_time: 1,
      } as DecodedIdToken;
    },
  );
  const remove = t.mock.method(adminAuth, "deleteUser", async (uid: string) => {
    calls.push(`delete:${uid}`);
    if (options.deleteError) throw new Error("Firebase unavailable");
  });
  const write = t.mock.fn(async (data: unknown, writeOptions: unknown) => {
    assert.equal((data as { status: string }).status, "deleted");
    assert.deepEqual(writeOptions, { merge: true });
    calls.push("mark-deleted");
    if (options.writeError) throw new Error("Firestore unavailable");
  });
  t.mock.method(adminDb, "doc", (path: string) => {
    assert.ok(
      path === "users/user-1" || path === "users/user-1/subscription/current",
    );
    return {
      get: async () => ({
        data: () =>
          path.endsWith("/current") ? options.subscription : options.user,
      }),
      set: write,
    };
  });
  const checkBilling = t.mock.fn(async (customer: string) => {
    assert.equal(customer, "cus_123");
    calls.push("check-billing");
    if (options.billingError) throw new Error("Stripe unavailable");
    return options.blocked ?? false;
  });
  const app = express();
  app.use(express.json());
  app.use("/api/account", createAccountRouter(checkBilling));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  const request = (token?: string) =>
    fetch(`http://127.0.0.1:${address.port}/api/account/me`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ uid: "someone-else" }),
    });
  return { calls, verify, remove, write, checkBilling, request };
}

test("account deletion requires valid authentication", async (t) => {
  const { request, remove, write } = await setup(t);
  assert.equal((await request()).status, 401);
  assert.equal((await request("invalid")).status, 401);
  assert.equal(remove.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
});

test("free users delete only their authenticated Firebase account before its status is changed", async (t) => {
  const { request, calls, verify, write, checkBilling } = await setup(t, {
    subscription: { planId: "free", status: "active" },
  });
  const response = await request("valid");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(calls, ["delete:user-1", "mark-deleted"]);
  assert.equal(verify.mock.calls[0].arguments[1], true);
  assert.equal(checkBilling.mock.callCount(), 0);
  const [data, options] = write.mock.calls[0].arguments;
  assert.equal((data as { status: string }).status, "deleted");
  assert.ok((data as { deletedAt: unknown }).deletedAt);
  assert.deepEqual(options, { merge: true });
});

test("active paid subscriptions block account deletion before Firebase or database writes", async (t) => {
  const { request, remove, write, checkBilling } = await setup(t, {
    user: { stripeCustomerId: "cus_123" },
    blocked: true,
  });
  const response = await request("valid");
  assert.equal(response.status, 409);
  const body = (await response.json()) as { message: string };
  assert.match(body.message, /Cancel your subscription/);
  assert.equal(checkBilling.mock.calls[0].arguments[0], "cus_123");
  assert.equal(remove.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
});

test("Stripe is checked even when the stored subscription says canceled", async (t) => {
  const { request, remove } = await setup(t, {
    user: { stripeCustomerId: "cus_123" },
    subscription: { status: "canceled" },
    blocked: true,
  });
  assert.equal((await request("valid")).status, 409);
  assert.equal(remove.mock.callCount(), 0);
});

test("canceled memberships can delete after Stripe confirms cancellation", async (t) => {
  const { request, calls } = await setup(t, {
    user: { stripeCustomerId: "cus_123" },
    subscription: { planId: "pro", status: "active", cancelAtPeriodEnd: true },
  });
  assert.equal((await request("valid")).status, 200);
  assert.deepEqual(calls, ["check-billing", "delete:user-1", "mark-deleted"]);
});

test("paid memberships without a Stripe customer are not treated as free", async (t) => {
  const { request, remove } = await setup(t, {
    subscription: { planId: "basic", status: "active" },
  });
  assert.equal((await request("valid")).status, 409);
  assert.equal(remove.mock.callCount(), 0);
});

test("billing verification failure leaves the account unchanged", async (t) => {
  const { request, remove, write } = await setup(t, {
    user: { stripeCustomerId: "cus_123" },
    billingError: true,
  });
  assert.equal((await request("valid")).status, 500);
  assert.equal(remove.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
});

test("Firebase deletion failure never marks the database user deleted", async (t) => {
  const { request, write } = await setup(t, { deleteError: true });
  assert.equal((await request("valid")).status, 500);
  assert.equal(write.mock.callCount(), 0);
});

test("Firestore status failure does not report an already-deleted account as active", async (t) => {
  const { request, calls } = await setup(t, { writeError: true });
  const response = await request("valid");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(calls, ["delete:user-1", "mark-deleted"]);
});

for (const [status, cancelAtPeriodEnd, cancelAt, expected] of [
  ["active", false, null, true],
  ["trialing", false, null, true],
  ["past_due", false, null, true],
  ["unpaid", false, null, true],
  ["paused", false, null, true],
  ["incomplete", false, null, true],
  ["active", true, null, false],
  ["active", false, 2_000_000_000, false],
  ["canceled", false, null, false],
  ["incomplete_expired", false, null, false],
] as const) {
  test(`deletion billing check: ${status}, cancellation ${cancelAtPeriodEnd || cancelAt || "none"}`, async () => {
    const subscriptions = {
      list: (params: unknown) => {
        assert.deepEqual(params, {
          customer: "cus_123",
          status: "all",
          limit: 100,
        });
        return (async function* () {
          yield {
            status: "canceled",
            cancel_at_period_end: false,
            cancel_at: null,
          };
          yield {
            status,
            cancel_at_period_end: cancelAtPeriodEnd,
            cancel_at: cancelAt,
          };
        })();
      },
    } as unknown as Stripe.SubscriptionResource;
    assert.equal(
      await hasUncancelledStripeSubscription("cus_123", subscriptions),
      expected,
    );
  });
}
