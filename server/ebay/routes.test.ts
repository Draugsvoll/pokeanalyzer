import assert from "node:assert/strict";
import test from "node:test";
import type { EbayCredits } from "../../shared/ebayCredits.js";
import type { PokeTraceSavedResponses } from "../../shared/pokeTraceSavedResponses.js";
import { buildEbayCardRequests } from "../services/ebayCompsApi.js";
import { EbayCreditError } from "./creditService.js";
import { requestEbayListings } from "./routes.js";
import type { EbaySearchEvent } from "../../shared/ebaySearch.js";

const credits: EbayCredits = {
  membershipCreditsRemaining: 0,
  membershipCreditsTotal: 0,
  membershipCreditsUsed: 0,
  bonusCreditsRemaining: 9,
  bonusCreditsTotal: 10,
  bonusCreditsUsed: 1,
  creditsRemaining: 9,
  planId: "free",
  version: 2,
};
const context = {
  cardName: "Nidoking",
  cardNumber: "011/130",
  savedResponses: {} as PokeTraceSavedResponses,
};
const query = buildEbayCardRequests(context).query;
const listings = { items: [{ title: "Nidoking 11/130 Base Set 2" }] };
const response = {
  active: listings,
  sold: listings,
  request_query: query,
  timestamp: new Date().toISOString(),
};

function fixture() {
  const calls = { fetch: 0, save: 0, credits: 0 };
  const dependencies: NonNullable<Parameters<typeof requestEbayListings>[3]> = {
    getContext: async () => context,
    fetchComps: async () => {
      calls.fetch += 1;
      return listings;
    },
    save: async () => {
      calls.save += 1;
      return response;
    },
    runFeature: async <T>(
      uid: string,
      operation: () => Promise<T>,
      signal?: AbortSignal,
    ) => {
      assert.equal(uid, "user-1");
      assert.ok(signal);
      const data = await operation();
      calls.credits += 1;
      return { data, credits };
    },
  };
  return { calls, dependencies, signal: new AbortController().signal };
}

test("a fresh eBay result fetches both modes and returns independent credits", async () => {
  const { calls, dependencies, signal } = fixture();
  const result = await requestEbayListings(
    "user-1",
    "card-1",
    signal,
    dependencies,
  );
  assert.deepEqual(calls, { fetch: 2, save: 1, credits: 1 });
  assert.deepEqual(result, { data: response, credits, fromDatabase: false });
  assert.equal("subscription" in result, false);
});

test("cached eBay results cost an eBay credit and preserve title filtering", async () => {
  const { calls, dependencies, signal } = fixture();
  const matching = [...listings.items, { title: "Pokemon 011/130 Holo" }];
  dependencies.getContext = async () => ({
    ...context,
    cardName: "Nidoking ex",
    savedResponses: {
      ebay: {
        ...response,
        request_query: "Nidoking ex 011/130",
        active: { items: [...matching, { title: "Unrelated Pikachu" }] },
        sold: { items: [...matching, { title: "Unrelated Pikachu" }] },
      },
    },
  });
  const result = await requestEbayListings(
    "user-1",
    "card-1",
    signal,
    dependencies,
  );
  assert.deepEqual(calls, { fetch: 0, save: 0, credits: 1 });
  assert.equal(result.fromDatabase, true);
  assert.deepEqual(result.data.active, { items: matching, totalItems: 2 });
  assert.deepEqual(result.data.sold, { items: matching, totalItems: 2 });
});

test("legacy cached results remain usable without involving AI request handling", async () => {
  const { calls, dependencies, signal } = fixture();
  dependencies.getContext = async () => ({
    ...context,
    savedResponses: { grok: { ebay_sold: response } },
  });
  const result = await requestEbayListings(
    "user-1",
    "card-1",
    signal,
    dependencies,
  );
  assert.equal(result.fromDatabase, true);
  assert.deepEqual(calls, { fetch: 0, save: 0, credits: 1 });
});

test("a partial provider response is returned and charged without caching", async () => {
  const { calls, dependencies, signal } = fixture();
  dependencies.fetchComps = async (_query, _signal, options) => {
    calls.fetch += 1;
    if (options?.sold === false)
      throw new Error("Active listing lookup failed");
    return listings;
  };
  const result = await requestEbayListings(
    "user-1",
    "card-1",
    signal,
    dependencies,
  );
  assert.deepEqual(calls, { fetch: 2, save: 0, credits: 1 });
  assert.deepEqual(result.data, {
    sold: listings,
    active: null,
    request_query: query,
  });
});

test("total provider failure and invalid payloads do not produce a successful charge", async () => {
  for (const fail of [true, false]) {
    const { calls, dependencies, signal } = fixture();
    dependencies.fetchComps = async () => {
      calls.fetch += 1;
      if (fail) throw new Error("Provider unavailable");
      return null;
    };
    await assert.rejects(
      requestEbayListings("user-1", "card-1", signal, dependencies),
      fail ? /Provider unavailable/ : /invalid response data/,
    );
    assert.deepEqual(calls, { fetch: 2, save: 0, credits: 0 });
  }
});

test("insufficient eBay credits prevents fetching and is an eBay-specific error", async () => {
  const { calls, dependencies, signal } = fixture();
  dependencies.runFeature = async () => {
    throw new EbayCreditError("Not enough eBay credits", 409);
  };
  await assert.rejects(
    requestEbayListings("user-1", "card-1", signal, dependencies),
    (error: unknown) =>
      error instanceof EbayCreditError && error.statusCode === 409,
  );
  assert.deepEqual(calls, { fetch: 0, save: 0, credits: 0 });
});

test("invalid and missing cards are rejected before credits or provider requests", async () => {
  const { calls, dependencies, signal } = fixture();
  for (const cardId of ["", "a".repeat(101), ["card-1"]]) {
    await assert.rejects(
      requestEbayListings("user-1", cardId, signal, dependencies),
      (error: unknown) =>
        error instanceof EbayCreditError && error.statusCode === 400,
    );
  }
  dependencies.getContext = async () => null;
  await assert.rejects(
    requestEbayListings("user-1", "missing", signal, dependencies),
    (error: unknown) =>
      error instanceof EbayCreditError && error.statusCode === 404,
  );
  assert.deepEqual(calls, { fetch: 0, save: 0, credits: 0 });
});

test("aborted eBay requests do not save results or complete a charge", async () => {
  const { calls, dependencies } = fixture();
  const controller = new AbortController();
  dependencies.fetchComps = async () => {
    calls.fetch += 1;
    controller.abort();
    return listings;
  };
  await assert.rejects(
    requestEbayListings("user-1", "card-1", controller.signal, dependencies),
    { name: "AbortError" },
  );
  assert.deepEqual(calls, { fetch: 2, save: 0, credits: 0 });
});

for (const first of ["sold", "active"] as const) {
  test(`publishes ${first} before waiting for the other provider`, async () => {
    const { dependencies, signal } = fixture();
    let finish!: (value: typeof listings) => void;
    const pending = new Promise<typeof listings>((resolve) => {
      finish = resolve;
    });
    dependencies.fetchComps = async (_query, _signal, options) =>
      (options?.sold === false ? "active" : "sold") === first
        ? listings
        : pending;
    const events: EbaySearchEvent[] = [];
    let firstPublished!: () => void;
    const published = new Promise<void>((resolve) => {
      firstPublished = resolve;
    });
    let complete = false;
    const request = requestEbayListings(
      "user-1",
      "card-1",
      signal,
      dependencies,
      (event) => {
        events.push(event);
        if (event.type === "result") firstPublished();
      },
    ).then((result) => {
      complete = true;
      return result;
    });
    await published;
    assert.equal(complete, false);
    assert.deepEqual(events, [{ type: "result", side: first, data: listings }]);
    finish(listings);
    await request;
    assert.equal(events.filter((event) => event.type === "result").length, 2);
  });
}

test("streams the failed side and keeps successful empty results billable", async () => {
  const { dependencies, signal, calls } = fixture();
  dependencies.fetchComps = async (_query, _signal, options) => {
    if (options?.sold === false) throw new Error("Timed out");
    return { items: [] };
  };
  const events: EbaySearchEvent[] = [];
  const result = await requestEbayListings(
    "user-1",
    "card-1",
    signal,
    dependencies,
    (event) => events.push(event),
  );
  assert.deepEqual(result.data.sold, { items: [] });
  assert.equal(result.data.active, null);
  assert.equal(calls.credits, 1);
  assert.equal(calls.save, 0);
  assert.ok(
    events.some((event) => event.type === "failure" && event.side === "active"),
  );
  assert.ok(
    events.some((event) => event.type === "result" && event.side === "sold"),
  );
});

test("a cache write failure does not discard or refund successful results", async () => {
  const { dependencies, signal, calls } = fixture();
  dependencies.save = async () => {
    throw new Error("Cache unavailable");
  };
  const result = await requestEbayListings(
    "user-1",
    "card-1",
    signal,
    dependencies,
  );
  assert.deepEqual(result.data.sold, listings);
  assert.deepEqual(result.data.active, listings);
  assert.equal(calls.credits, 1);
});

test("cached results emit both sides without contacting the providers", async () => {
  const { dependencies, signal, calls } = fixture();
  dependencies.getContext = async () => ({
    ...context,
    savedResponses: { ebay: response },
  });
  const events: EbaySearchEvent[] = [];
  await requestEbayListings("user-1", "card-1", signal, dependencies, (event) =>
    events.push(event),
  );
  assert.equal(calls.fetch, 0);
  assert.equal(events.filter((event) => event.type === "result").length, 2);
});
