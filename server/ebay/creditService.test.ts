import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../subscriptions/firebaseAdmin.js";
import type { StoredUserSubscription } from "../subscriptions/subscriptionModel.js";
import { requestTcgExplorer } from "../tcg/routes.js";
import {
  EbayCreditError,
  getEbayCredits,
  grantEbaySignupCredits,
  runEbayFeature,
} from "./creditService.js";

const subscriptionPath = "users/user-1/subscription/current";
const creditsPath = "users/user-1/ebay_credits/current";

test("TCG searches spend the same allowance as eBay and refund complete failures", async (t) => {
  mockFirestore(t, buildSubscription());
  const deps: NonNullable<Parameters<typeof requestTcgExplorer>[3]> = {
    getContext: async () => ({
      name: "Pikachu",
      cardNumber: "58/102",
      setName: "Base Set",
      productId: 123,
      printing: "Normal",
      supportedGame: true,
      cached: undefined,
    }),
    getConfig: () => ({
      key: "test",
      salesUrl: "https://example.com/sales",
      listingsUrl: "https://example.com/listings",
    }),
    fetchSales: async () => [],
    fetchOffers: async () => ({ offers: [], offersMatched: true }),
    save: async () => {},
    runFeature: runEbayFeature,
  };
  const search = () =>
    requestTcgExplorer(
      "user-1",
      { cardId: "card", condition: "nearMint", language: "English" },
      new AbortController().signal,
      deps,
    );
  await runEbayFeature("user-1", async () => "eBay results");
  await search();
  assert.equal((await getEbayCredits("user-1")).creditsRemaining, 3);
  deps.fetchSales = async () => {
    throw new Error("Unavailable");
  };
  deps.fetchOffers = async () => {
    throw new Error("Unavailable");
  };
  await assert.rejects(search());
  assert.equal((await getEbayCredits("user-1")).creditsRemaining, 3);
  // Once a side has been delivered, disconnecting must not refund it.
  deps.fetchSales = async () => [];
  const controller = new AbortController();
  await assert.rejects(
    requestTcgExplorer(
      "user-1",
      { cardId: "card", condition: "all", language: "English" },
      controller.signal,
      deps,
      (event) => {
        if (event.type === "result") controller.abort();
      },
    ),
  );
  assert.equal((await getEbayCredits("user-1")).creditsRemaining, 2);
});

test("a partial success stays charged if the client disconnects", async (t) => {
  mockFirestore(t, buildSubscription());
  const controller = new AbortController();
  let succeeded = false;
  let reservedBalance = -1;
  await assert.rejects(
    runEbayFeature(
      "user-1",
      async () => {
        succeeded = true;
        controller.abort();
        throw new DOMException("Disconnected", "AbortError");
      },
      controller.signal,
      {
        hasSucceeded: () => succeeded,
        onReserved: (credits) => {
          reservedBalance = credits.creditsRemaining;
        },
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(reservedBalance, 4);
  assert.equal((await getEbayCredits("user-1")).creditsRemaining, 4);
});

test("a failed search with no successful side refunds its one reservation", async (t) => {
  mockFirestore(t, buildSubscription());
  await assert.rejects(
    runEbayFeature(
      "user-1",
      async () => {
        throw new Error("Both providers failed");
      },
      undefined,
      { hasSucceeded: () => false },
    ),
    /Both providers failed/,
  );
  assert.equal((await getEbayCredits("user-1")).creditsRemaining, 5);
});

function buildSubscription(
  overrides: Partial<StoredUserSubscription> = {},
): StoredUserSubscription {
  return {
    bonusCreditsRemaining: 77,
    bonusCreditsTotal: 100,
    bonusCreditsUsed: 23,
    cancelAtPeriodEnd: false,
    currentPeriodStart: Timestamp.fromMillis(Date.now() - 86_400_000),
    currentPeriodEnd: Timestamp.fromMillis(Date.now() + 29 * 86_400_000),
    membershipCreditsRemaining: 4,
    membershipCreditsTotal: 20,
    membershipCreditsUsed: 16,
    planId: "basic",
    planName: "Basic",
    status: "active",
    ...overrides,
  };
}

function mockFirestore(t: TestContext, subscription?: StoredUserSubscription) {
  const documents = new Map<string, object>();
  if (subscription) documents.set(subscriptionPath, subscription);
  const writes: string[] = [];
  let previousTransaction: Promise<unknown> = Promise.resolve();
  let accountCreatedAt = new Date(Date.now() - 1000).toISOString();

  type Ref = { path: string };
  type Transaction = {
    get: (ref: Ref) => Promise<{
      exists: boolean;
      data: () => object | undefined;
    }>;
    set: (ref: Ref, value: object) => void;
  };
  t.mock.method(adminAuth, "getUser", async () => ({
    metadata: { creationTime: accountCreatedAt },
  }));
  t.mock.method(adminDb, "doc", (path: string) => ({ path }));
  t.mock.method(
    adminDb,
    "runTransaction",
    (operation: (transaction: Transaction) => Promise<unknown>) => {
      // Serialize transactions so parallel callers observe committed balances.
      const result = previousTransaction.then(async () => {
        const pending = new Map<string, object>();
        const transaction: Transaction = {
          get: async ({ path }) => ({
            exists: documents.has(path),
            data: () => documents.get(path),
          }),
          set: ({ path }, value) => {
            pending.set(path, value);
          },
        };
        const value = await operation(transaction);
        for (const [path, data] of pending) {
          documents.set(path, data);
          writes.push(path);
        }
        return value;
      });
      previousTransaction = result.catch(() => undefined);
      return result;
    },
  );
  return {
    documents,
    writes,
    setAccountCreatedAt: (createdAt: string) => {
      accountCreatedAt = createdAt;
    },
    setSubscription: (next: StoredUserSubscription) =>
      documents.set(subscriptionPath, next),
  };
}

test("reading a free account balance never grants signup credits", async (t) => {
  const { writes } = mockFirestore(t);
  const initial = await getEbayCredits("user-1");
  assert.equal(initial.planId, "free");
  assert.equal(initial.membershipCreditsTotal, 0);
  assert.equal(initial.bonusCreditsTotal, 0);
  assert.equal(initial.bonusCreditsRemaining, 0);
  assert.equal(initial.creditsRemaining, 0);
  assert.equal(initial.version, 1);
  assert.deepEqual(await getEbayCredits("user-1"), initial);
  assert.equal(writes.length, 1);
});

test("a new signup gets ten market credits once and repeated grants never refill them", async (t) => {
  const { writes, setSubscription, setAccountCreatedAt } = mockFirestore(t);
  const initial = await grantEbaySignupCredits("user-1");
  assert.equal(initial.bonusCreditsTotal, 10);
  assert.equal(initial.bonusCreditsRemaining, 10);
  assert.equal(initial.creditsRemaining, 10);
  assert.equal(initial.version, 1);
  assert.deepEqual(await grantEbaySignupCredits("user-1"), initial);
  assert.equal(writes.length, 1);
  await runEbayFeature("user-1", async () => "listings");
  setSubscription(buildSubscription({ planId: "free", planName: "Free" }));
  setAccountCreatedAt(new Date(Date.now() - 86_400_000).toISOString());
  const existingAccount = await grantEbaySignupCredits("user-1");
  assert.equal(existingAccount.bonusCreditsRemaining, 9);
  assert.equal(existingAccount.bonusCreditsTotal, 10);
  assert.equal(existingAccount.bonusCreditsUsed, 1);
  assert.equal(existingAccount.membershipCreditsRemaining, 0);
  assert.ok(existingAccount.version > initial.version);
});

test("signup can grant credits after an earlier balance fetch created a zero balance", async (t) => {
  mockFirestore(t);
  const earlyBalance = await getEbayCredits("user-1");
  assert.equal(earlyBalance.bonusCreditsTotal, 0);
  const granted = await grantEbaySignupCredits("user-1");
  assert.equal(granted.bonusCreditsTotal, 10);
  assert.equal(granted.bonusCreditsRemaining, 10);
  assert.equal(granted.version, earlyBalance.version + 1);
});

test("old, invalid and future account creation times cannot claim signup credits", async (t) => {
  const { writes, setAccountCreatedAt } = mockFirestore(t);
  for (const createdAt of [
    new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    "invalid date",
    new Date(Date.now() + 60 * 1000).toISOString(),
  ]) {
    setAccountCreatedAt(createdAt);
    await assert.rejects(
      grantEbaySignupCredits("user-1"),
      (error: unknown) =>
        error instanceof EbayCreditError && error.statusCode === 403,
    );
  }
  assert.equal(writes.length, 0);
  assert.equal((await getEbayCredits("user-1")).bonusCreditsTotal, 0);
});

test("concurrent signup grants apply the ten-credit bonus only once", async (t) => {
  const { writes } = mockFirestore(t);
  const results = await Promise.all([
    grantEbaySignupCredits("user-1"),
    grantEbaySignupCredits("user-1"),
  ]);
  assert.equal(results[0].bonusCreditsTotal, 10);
  assert.deepEqual(results[0], results[1]);
  assert.equal(writes.length, 1);
});

test("Basic gets five monthly searches and Pro gets unlimited access, ignoring AI balances", async (t) => {
  const subscription = buildSubscription();
  const { documents, writes, setSubscription } = mockFirestore(t, subscription);
  const basic = await getEbayCredits("user-1");
  assert.equal(basic.membershipCreditsTotal, 5);
  assert.equal(basic.membershipCreditsRemaining, 5);
  assert.equal(basic.membershipCreditsUsed, 0);
  assert.equal(basic.bonusCreditsTotal, 0);
  assert.equal(basic.creditsRemaining, 5);
  assert.deepEqual(documents.get(subscriptionPath), subscription);
  assert.deepEqual(writes, [creditsPath]);

  setSubscription({ ...subscription, planId: "pro", planName: "Pro" });
  const pro = await getEbayCredits("user-1");
  assert.equal(pro.membershipCreditsTotal, 0);
  assert.equal(pro.bonusCreditsTotal, 0);
  assert.equal(pro.creditsRemaining, 0);
  assert.equal(pro.unlimited, true);
});

test("successful fetches spend membership market credits before the signup bonus", async (t) => {
  const subscription = buildSubscription();
  const { documents, writes } = mockFirestore(t, subscription);
  await grantEbaySignupCredits("user-1");
  const result = await runEbayFeature("user-1", async () => ["sale"]);
  assert.deepEqual(result.data, ["sale"]);
  assert.equal(result.credits.membershipCreditsRemaining, 4);
  assert.equal(result.credits.membershipCreditsUsed, 1);
  assert.equal(result.credits.bonusCreditsRemaining, 10);
  assert.equal(result.credits.creditsRemaining, 14);
  assert.deepEqual(documents.get(subscriptionPath), subscription);
  assert.ok(writes.every((path) => path === creditsPath));
});

test("Basic permits five searches and rejects a sixth without bonus credits", async (t) => {
  mockFirestore(t, buildSubscription());
  for (let index = 0; index < 5; index += 1) {
    await runEbayFeature("user-1", async () => "listings");
  }
  const operation = t.mock.fn(async () => "listings");
  await assert.rejects(runEbayFeature("user-1", operation), EbayCreditError);
  assert.equal(operation.mock.callCount(), 0);
  assert.equal((await getEbayCredits("user-1")).creditsRemaining, 0);
});

test("Pro searches never spend bonus credits, including failed requests", async (t) => {
  mockFirestore(t, buildSubscription({ planId: "pro", planName: "Pro" }));
  await grantEbaySignupCredits("user-1");
  for (let index = 0; index < 6; index += 1) {
    const result = await runEbayFeature("user-1", async () => "listings");
    assert.equal(result.credits.unlimited, true);
  }
  await assert.rejects(
    runEbayFeature("user-1", async () => {
      throw new Error("provider failed");
    }),
    /provider failed/,
  );
  const balance = await getEbayCredits("user-1");
  assert.equal(balance.bonusCreditsRemaining, 10);
  assert.equal(balance.bonusCreditsUsed, 0);
  assert.equal(balance.membershipCreditsUsed, 0);
});

test("Pro with no numeric balance can search, but loses unlimited access when inactive", async (t) => {
  const subscription = buildSubscription({ planId: "pro", planName: "Pro" });
  const { setSubscription } = mockFirestore(t, subscription);
  assert.equal(
    (await runEbayFeature("user-1", async () => "listings")).credits.unlimited,
    true,
  );
  for (const next of [
    { ...subscription, status: "past_due" as const },
    {
      ...subscription,
      currentPeriodEnd: Timestamp.fromMillis(Date.now() - 1000),
    },
    { ...subscription, currentPeriodStart: undefined },
  ]) {
    setSubscription(next);
    assert.equal((await getEbayCredits("user-1")).unlimited, false);
    await assert.rejects(
      runEbayFeature("user-1", async () => "listings"),
      EbayCreditError,
    );
  }
});

test("legacy Collector accounts receive Basic's allowance", async (t) => {
  mockFirestore(
    t,
    buildSubscription({ planId: "collector", planName: "Collector" }),
  );
  const balance = await getEbayCredits("user-1");
  assert.equal(balance.planId, "basic");
  assert.equal(balance.membershipCreditsTotal, 5);
  assert.equal(balance.unlimited, false);
});

test("an upgrade increases the allowance without forgetting existing eBay spending", async (t) => {
  const subscription = buildSubscription();
  const { setSubscription } = mockFirestore(t, subscription);
  await runEbayFeature("user-1", async () => "listings");
  setSubscription({ ...subscription, planId: "pro", planName: "Pro" });
  const upgraded = await getEbayCredits("user-1");
  assert.equal(upgraded.membershipCreditsTotal, 0);
  assert.equal(upgraded.membershipCreditsRemaining, 0);
  assert.equal(upgraded.unlimited, true);
  assert.equal(upgraded.membershipCreditsUsed, 1);

  setSubscription(subscription);
  const downgraded = await getEbayCredits("user-1");
  assert.equal(downgraded.membershipCreditsRemaining, 4);
  assert.equal(downgraded.membershipCreditsUsed, 1);
});

test("monthly renewal resets only the membership eBay allowance", async (t) => {
  const subscription = buildSubscription({
    currentPeriodStart: Timestamp.fromMillis(Date.now() - 15 * 86_400_000),
  });
  const { setSubscription } = mockFirestore(t);
  await grantEbaySignupCredits("user-1");
  await runEbayFeature("user-1", async () => "bonus-funded listings");
  setSubscription(subscription);
  await runEbayFeature("user-1", async () => "membership-funded listings");
  setSubscription({
    ...subscription,
    currentPeriodStart: Timestamp.fromMillis(Date.now() - 1000),
    currentPeriodEnd: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
  });
  const renewed = await getEbayCredits("user-1");
  assert.equal(renewed.membershipCreditsRemaining, 5);
  assert.equal(renewed.membershipCreditsUsed, 0);
  assert.equal(renewed.bonusCreditsRemaining, 9);
  assert.equal(renewed.bonusCreditsUsed, 1);
});

test("free monthly renewal never refills the signup bonus", async (t) => {
  const { setSubscription } = mockFirestore(t);
  await grantEbaySignupCredits("user-1");
  await runEbayFeature("user-1", async () => "listings");
  setSubscription(
    buildSubscription({
      planId: "free",
      currentPeriodStart: Timestamp.fromMillis(Date.now() - 1000),
    }),
  );
  const renewed = await getEbayCredits("user-1");
  assert.equal(renewed.membershipCreditsTotal, 0);
  assert.equal(renewed.bonusCreditsRemaining, 9);
});

test("an expired or inactive paid period grants no monthly credits", async (t) => {
  const subscription = buildSubscription();
  const { setSubscription } = mockFirestore(t, {
    ...subscription,
    currentPeriodEnd: Timestamp.fromMillis(Date.now() - 1000),
  });
  assert.equal((await getEbayCredits("user-1")).membershipCreditsRemaining, 0);
  setSubscription({ ...subscription, status: "past_due" });
  assert.equal((await getEbayCredits("user-1")).membershipCreditsRemaining, 0);
  setSubscription({ ...subscription, currentPeriodStart: undefined });
  assert.equal((await getEbayCredits("user-1")).membershipCreditsRemaining, 0);
});

test("reactivating a paid period preserves its previous eBay spending", async (t) => {
  const subscription = buildSubscription();
  const { setSubscription } = mockFirestore(t, subscription);
  await runEbayFeature("user-1", async () => "listings");
  setSubscription({ ...subscription, status: "past_due" });
  await getEbayCredits("user-1");
  setSubscription(subscription);
  const restored = await getEbayCredits("user-1");
  assert.equal(restored.membershipCreditsRemaining, 4);
  assert.equal(restored.membershipCreditsUsed, 1);
});

test("parallel requests cannot both reserve the last market credit", async (t) => {
  mockFirestore(t);
  await grantEbaySignupCredits("user-1");
  for (let index = 0; index < 9; index += 1) {
    await runEbayFeature("user-1", async () => "listings");
  }
  const operation = t.mock.fn(async () => "last listings");
  const requests = await Promise.allSettled([
    runEbayFeature("user-1", operation),
    runEbayFeature("user-1", operation),
  ]);
  assert.equal(
    requests.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejection = requests.find((result) => result.status === "rejected");
  assert.ok(rejection?.reason instanceof EbayCreditError);
  assert.equal(rejection.reason.statusCode, 409);
  assert.equal(operation.mock.callCount(), 1);
  assert.equal((await getEbayCredits("user-1")).creditsRemaining, 0);
});

test("a failed fetch refunds its market credit and leaves AI balances untouched", async (t) => {
  const subscription = buildSubscription();
  const { documents } = mockFirestore(t, subscription);
  const initial = await getEbayCredits("user-1");
  await assert.rejects(
    runEbayFeature("user-1", async () => {
      throw new Error("eBay unavailable");
    }),
    /eBay unavailable/,
  );
  const refunded = await getEbayCredits("user-1");
  assert.equal(refunded.creditsRemaining, initial.creditsRemaining);
  assert.equal(refunded.membershipCreditsUsed, 0);
  assert.ok(refunded.version > initial.version);
  assert.deepEqual(documents.get(subscriptionPath), subscription);
});

test("aborted requests do not spend market credits", async (t) => {
  const { writes } = mockFirestore(t);
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  const operation = t.mock.fn(async () => "listings");
  await assert.rejects(
    runEbayFeature("user-1", operation, alreadyAborted.signal),
    { name: "AbortError" },
  );
  assert.equal(operation.mock.callCount(), 0);
  assert.equal(writes.length, 0);

  await grantEbaySignupCredits("user-1");
  const controller = new AbortController();
  await assert.rejects(
    runEbayFeature(
      "user-1",
      async () => {
        controller.abort();
        return "listings";
      },
      controller.signal,
    ),
    { name: "AbortError" },
  );
  const refunded = await getEbayCredits("user-1");
  assert.equal(refunded.bonusCreditsRemaining, 10);
  assert.equal(refunded.bonusCreditsUsed, 0);
});

test("a failed old request cannot refund spending from the next billing period", async (t) => {
  const subscription = buildSubscription();
  const { setSubscription } = mockFirestore(t, subscription);
  await assert.rejects(
    runEbayFeature("user-1", async () => {
      setSubscription({
        ...subscription,
        currentPeriodStart: Timestamp.fromMillis(Date.now() - 1000),
        currentPeriodEnd: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
      });
      await runEbayFeature("user-1", async () => "new period listings");
      throw new Error("old request failed");
    }),
    /old request failed/,
  );
  const current = await getEbayCredits("user-1");
  assert.equal(current.membershipCreditsRemaining, 4);
  assert.equal(current.membershipCreditsUsed, 1);
});
