import assert from "node:assert/strict";
import { once } from "node:events";
import test, { type TestContext } from "node:test";
import express from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { EbayCredits } from "../../shared/ebayCredits.js";
import { adminAuth } from "../subscriptions/firebaseAdmin.js";
import { attachRequestAbortSignal } from "../security/requestAbort.js";
import { EbayCreditError } from "./creditService.js";
import { createEbayRouter } from "./routes.js";

const credits: EbayCredits = {
  membershipCreditsRemaining: 0,
  membershipCreditsTotal: 0,
  membershipCreditsUsed: 0,
  bonusCreditsRemaining: 10,
  bonusCreditsTotal: 10,
  bonusCreditsUsed: 0,
  creditsRemaining: 10,
  planId: "free",
  version: 1,
};

test("HTTP streaming delivers the first result while the second is still pending", async (t) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  t.after(() => finish());
  const { baseUrl } = await startRouter(t, {
    requestListings: async (_uid, _card, _signal, _dependencies, emit) => {
      emit?.({ type: "started", credits });
      emit?.({ type: "result", side: "active", data: { items: [] } });
      await pending;
      emit?.({ type: "result", side: "sold", data: { items: [] } });
      return {
        data: {
          sold: { items: [] },
          active: { items: [] },
          request_query: "test",
        },
        credits,
        fromDatabase: false,
      };
    },
  });
  const response = await fetch(`${baseUrl}?cardId=card-1&stream=1`, {
    headers: { Authorization: "Bearer verified" },
    signal: AbortSignal.timeout(5_000),
  });
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/x-ndjson/,
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes('"type":"result"')) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    text += decoder.decode(chunk.value, { stream: true });
  }
  assert.ok(text.includes('"side":"active"'));
  assert.ok(!text.includes('"type":"complete"'));
  finish();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  const events = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    events.map((event) => event.type),
    ["started", "result", "result", "complete"],
  );
});

test("streaming preflight failures still return an ordinary HTTP error", async (t) => {
  const { request } = await startRouter(t, {
    requestListings: async () => {
      throw new EbayCreditError("Not enough Ebay credits", 409);
    },
  });
  assert.deepEqual(await request("/?cardId=card-1&stream=1", "verified"), {
    status: 409,
    body: { error: "Not enough Ebay credits" },
  });
});

test("errors after streaming starts are sent as terminal events", async (t) => {
  const { baseUrl } = await startRouter(t, {
    requestListings: async (_uid, _card, _signal, _dependencies, emit) => {
      emit?.({ type: "started", credits });
      throw new Error("Provider failure");
    },
  });
  const response = await fetch(`${baseUrl}?cardId=card-1&stream=1`, {
    headers: { Authorization: "Bearer verified" },
  });
  assert.equal(response.status, 200);
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, "error");
});

async function startRouter(
  t: TestContext,
  overrides: Parameters<typeof createEbayRouter>[0] = {},
) {
  const calls = { signup: 0, balance: 0, search: 0 };
  t.mock.method(
    adminAuth,
    "verifyIdToken",
    async (token: string, checkRevoked: boolean) => {
      assert.equal(checkRevoked, true);
      if (token === "invalid") throw new Error("Invalid token");
      return {
        uid: `user-${token}`,
        email_verified: token === "verified",
      } as DecodedIdToken;
    },
  );
  const app = express();
  app.use(attachRequestAbortSignal);
  app.use(
    "/ebay",
    createEbayRouter({
      grantSignupCredits: async () => {
        calls.signup += 1;
        return credits;
      },
      getCredits: async () => {
        calls.balance += 1;
        return credits;
      },
      requestListings: async () => {
        calls.search += 1;
        return {
          data: {
            active: { items: [] },
            sold: { items: [] },
            request_query: "Nidoking",
          },
          credits,
          fromDatabase: false,
        };
      },
      ...overrides,
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/ebay`;
  const request = async (path: string, token?: string, method = "GET") => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(token && { headers: { Authorization: `Bearer ${token}` } }),
    });
    const body: unknown = await response.json();
    return { status: response.status, body };
  };
  return { calls, request, baseUrl };
}

test("unverified authenticated users can claim signup credits but cannot search or read balances", async (t) => {
  const { calls, request } = await startRouter(t);
  assert.deepEqual(await request("/signup-credits", "unverified", "POST"), {
    status: 200,
    body: { credits },
  });
  for (const path of ["/credits", "/?cardId=card-1"]) {
    assert.deepEqual(await request(path, "unverified"), {
      status: 403,
      body: { message: "Verify your email before using this feature" },
    });
  }
  assert.deepEqual(calls, { signup: 1, balance: 0, search: 0 });
});

test("unauthenticated and invalid-token users cannot reach any eBay credit or search handler", async (t) => {
  const { calls, request } = await startRouter(t);
  for (const token of [undefined, "invalid"]) {
    for (const [path, method] of [
      ["/signup-credits", "POST"],
      ["/credits", "GET"],
      ["/?cardId=card-1", "GET"],
    ]) {
      const result = await request(path, token, method);
      assert.equal(result.status, 401);
      assert.deepEqual(result.body, {
        message: token ? "Invalid or expired auth token" : "Missing auth token",
      });
    }
  }
  assert.deepEqual(calls, { signup: 0, balance: 0, search: 0 });
});

test("verified users can still read balances and search independently", async (t) => {
  const { calls, request } = await startRouter(t);
  assert.deepEqual(await request("/credits", "verified"), {
    status: 200,
    body: { credits },
  });
  assert.equal((await request("/?cardId=card-1", "verified")).status, 200);
  assert.deepEqual(calls, { signup: 0, balance: 1, search: 1 });
});

test("signup grant rejection uses its own error and does not reach search or balance handlers", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const { calls, request } = await startRouter(t, {
    grantSignupCredits: async () => {
      throw new EbayCreditError("Signup credit eligibility has expired", 403);
    },
  });
  assert.deepEqual(await request("/signup-credits", "unverified", "POST"), {
    status: 403,
    body: { error: "Signup credit eligibility has expired" },
  });
  assert.deepEqual(calls, { signup: 0, balance: 0, search: 0 });
});
