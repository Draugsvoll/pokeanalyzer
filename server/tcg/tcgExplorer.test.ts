import type { MarketplaceSearchEvent } from "../../shared/marketplaceSearch.js";
import { saveTcgSnapshot, getTcgCardContext } from "./store.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { saveCardEbayResponse } from "../db/ebayStore.js";
import { toPokemonCard } from "../services/pokeTraceCardView.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth } from "../subscriptions/firebaseAdmin.js";
import { attachRequestAbortSignal } from "../security/requestAbort.js";
import { createTcgRouter } from "./routes.js";
import { fetchTcgOffers, fetchTcgSales } from "../services/tcgCompsApi.js";
import { getCachedTcgSnapshot, TCG_CACHE_MS } from "./store.js";
import { requestTcgExplorer } from "./routes.js";
import type { TcgSnapshot } from "../../shared/tcgExplorer.js";
import type { EbayCredits } from "../../shared/ebayCredits.js";

const context = {
  name: "Charizard",
  cardNumber: "4/102",
  setName: "Base Set",
  productId: 123,
  printing: "all",
  condition: "nearMint" as const,
  language: "English" as const,
};
const config = {
  key: "test",
  salesUrl: "https://example.com/sales",
  listingsUrl: "https://example.com/listings",
};
const sale = {
  price: 100,
  shippingPrice: 2,
  condition: "Near Mint",
  variant: "Holofoil",
  language: "English",
  quantity: 1,
  soldDate: "2026-10-01T12:00:00Z",
};
const offer = {
  price: 90,
  shippingPrice: 3,
  condition: "Near Mint",
  printing: "Holofoil",
  language: "English",
  quantity: 2,
  sellerName: "Shop",
  sellerRating: 99,
  verifiedSeller: true,
  directSeller: false,
};
const credits: EbayCredits = {
  planId: "basic",
  membershipCreditsRemaining: 4,
  membershipCreditsTotal: 5,
  membershipCreditsUsed: 1,
  bonusCreditsRemaining: 0,
  bonusCreditsTotal: 0,
  bonusCreditsUsed: 0,
  creditsRemaining: 4,
  version: 1,
};
const snapshot: TcgSnapshot = {
  ...context,
  fetchedAt: new Date().toISOString(),
  sales: [sale],
  offers: [offer],
  offersMatched: true,
};

const providerSale = {
  ...sale,
  shipping: sale.shippingPrice,
  soldAt: sale.soldDate,
};
const providerOffer = {
  ...offer,
  shipping: offer.shippingPrice,
  variant: offer.printing,
  goldSeller: true,
  sellerSales: 1234,
  sellerLocation: "US",
};

test("Compsniper sales use exact product and text filters and map its response", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    assert.equal(url.searchParams.get("productId"), "123");
    assert.equal(url.searchParams.has("variant"), false);
    assert.equal(url.searchParams.get("condition"), "Near Mint");
    assert.equal(url.searchParams.get("language"), "English");
    assert.equal(url.searchParams.get("count"), "250");
    assert.equal(url.searchParams.get("history"), "none");
    assert.equal(url.searchParams.has("keyword"), false);
    assert.equal(
      (init.headers as Record<string, string>).Authorization,
      "Bearer test",
    );
    return Response.json({
      product: { productId: 123 },
      items: [
        providerSale,
        { ...providerSale, variant: "Normal" },
        { ...providerSale, language: "French" },
        { ...providerSale, condition: "Damaged" },
      ],
    });
  });
  assert.deepEqual(
    await fetchTcgSales(context, new AbortController().signal, config),
    [sale, { ...sale, variant: "Normal" }],
  );
});
test("all conditions omit the provider condition filter", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.equal(url.searchParams.has("condition"), false);
    return Response.json({
      product: { productId: 123 },
      items: [{ ...providerSale, condition: "Damaged" }],
    });
  });
  assert.equal(
    (
      await fetchTcgSales(
        { ...context, condition: "all" },
        new AbortController().signal,
        config,
      )
    ).length,
    1,
  );
});
test("Compsniper listings use exact product ID and preserve seller metadata", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.equal(url.searchParams.get("productId"), "123");
    assert.equal(url.searchParams.has("keyword"), false);
    assert.equal(url.searchParams.has("variant"), false);
    assert.equal(url.searchParams.get("condition"), "Near Mint");
    assert.equal(url.searchParams.get("count"), "50");
    assert.equal(url.searchParams.get("page"), "1");
    return Response.json({
      product: { productId: 123 },
      items: [providerOffer, { ...providerOffer, variant: "Reverse Holofoil" }],
    });
  });
  assert.deepEqual(
    await fetchTcgOffers(context, new AbortController().signal, config),
    {
      offers: [
        { ...offer, goldSeller: true, sellerSales: 1234, sellerLocation: "US" },
        {
          ...offer,
          printing: "Reverse Holofoil",
          goldSeller: true,
          sellerSales: 1234,
          sellerLocation: "US",
        },
      ],
      offersMatched: true,
    },
  );
});
test("wrong products and missing prices fail rather than fabricating empty or free results", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ product: { productId: 999 }, items: [providerSale] }),
  );
  await assert.rejects(
    fetchTcgSales(context, new AbortController().signal, config),
  );
  await assert.rejects(
    fetchTcgOffers(context, new AbortController().signal, config),
  );
  for (const row of [
    { ...providerSale, price: null },
    { ...providerSale, shipping: null },
    { ...providerSale, soldAt: "bad date" },
  ]) {
    mock.mock.mockImplementation(async () =>
      Response.json({ product: { productId: 123 }, items: [row] }),
    );
    await assert.rejects(
      fetchTcgSales(context, new AbortController().signal, config),
    );
  }
});
test("decimal strings map to numbers and valid empty responses succeed", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      product: { productId: 123 },
      items: [{ ...providerSale, price: "100.00", shipping: "2.00" }],
    }),
  );
  assert.deepEqual(
    await fetchTcgSales(context, new AbortController().signal, config),
    [sale],
  );
  mock.mock.mockImplementation(async () =>
    Response.json({ product: { productId: 123 }, items: [] }),
  );
  assert.deepEqual(
    await fetchTcgOffers(context, new AbortController().signal, config),
    { offers: [], offersMatched: true },
  );
});
test("cache is separated by product, printing, condition and language and expires", () => {
  const now = Date.parse(snapshot.fetchedAt);
  assert.equal(getCachedTcgSnapshot(snapshot, context, now), snapshot);
  for (const filters of [
    { ...context, productId: 456 },
    { ...context, printing: "Normal" },
    { ...context, condition: "damaged" as const },
    { ...context, language: "French" as const },
  ]) {
    assert.equal(getCachedTcgSnapshot(snapshot, filters, now), null);
  }
  assert.equal(
    getCachedTcgSnapshot(snapshot, context, now + TCG_CACHE_MS),
    null,
  );
  assert.equal(getCachedTcgSnapshot(snapshot, context, now - 1), null);
  assert.equal(
    getCachedTcgSnapshot({ ...snapshot, sales: null }, context, now),
    null,
  );
});

function fixture(cached?: unknown) {
  const calls = { sales: 0, offers: 0, reserve: 0, save: 0 };
  const deps: NonNullable<Parameters<typeof requestTcgExplorer>[3]> = {
    getContext: async () => ({ ...context, supportedGame: true, cached }),
    getConfig: () => config,
    fetchSales: async () => {
      calls.sales++;
      return [sale];
    },
    fetchOffers: async () => {
      calls.offers++;
      return { offers: [offer], offersMatched: true };
    },
    save: async () => {
      calls.save++;
    },
    runFeature: async <T>(
      _uid: string,
      operation: () => Promise<T>,
      _signal?: AbortSignal,
      options?: { onReserved?: (credits: EbayCredits) => void },
    ) => {
      calls.reserve++;
      options?.onReserved?.(credits);
      return { data: await operation(), credits };
    },
  };
  return {
    calls,
    deps,
    signal: new AbortController().signal,
    input: { cardId: "card", condition: "nearMint", language: "English" },
  };
}
test("one combined search uses one shared reservation and two provider calls", async () => {
  const { calls, deps, signal, input } = fixture();
  const result = await requestTcgExplorer("user", input, signal, deps);
  assert.deepEqual(calls, { sales: 1, offers: 1, reserve: 1, save: 1 });
  assert.equal(result.credits, credits);
});
test("cached search still uses one allowance reservation but no provider calls", async () => {
  const { calls, deps, signal, input } = fixture(snapshot);
  await requestTcgExplorer("user", input, signal, deps);
  assert.deepEqual(calls, { sales: 0, offers: 0, reserve: 1, save: 0 });
});
test("invalid filters, unsupported printing and missing configuration fail before reservation", async () => {
  const { calls, deps, signal, input } = fixture();
  await assert.rejects(
    requestTcgExplorer("user", { ...input, condition: "psa10" }, signal, deps),
  );
  deps.getConfig = () => {
    throw new Error("Missing key");
  };
  await assert.rejects(requestTcgExplorer("user", input, signal, deps));
  deps.getContext = async () => ({
    ...context,
    printing: "Foil",
    supportedGame: false,
    cached: undefined,
  });
  await assert.rejects(requestTcgExplorer("user", input, signal, deps));
  assert.equal(calls.reserve, 0);
});
test("partial results survive, total failures reject for the shared service to refund", async () => {
  const { calls, deps, signal, input } = fixture();
  deps.fetchOffers = async () => {
    throw new Error("Unavailable");
  };
  const result = await requestTcgExplorer("user", input, signal, deps);
  assert.deepEqual(result.data.sales, [sale]);
  assert.equal(result.data.offers, null);
  assert.equal(calls.save, 0);
  deps.fetchSales = async () => {
    throw new Error("Unavailable");
  };
  await assert.rejects(requestTcgExplorer("user", input, signal, deps));
  deps.fetchOffers = async () => ({ offers: [], offersMatched: false });
  await assert.rejects(requestTcgExplorer("user", input, signal, deps));
});
test("cache write failure does not discard successful results", async () => {
  const { deps, signal, input } = fixture();
  deps.save = async () => {
    throw new Error("Storage unavailable");
  };
  assert.deepEqual(
    (await requestTcgExplorer("user", input, signal, deps)).data.sales,
    [sale],
  );
});

test("TCG HTTP endpoint rejects guests/unverified accounts before searching", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async (token: string) => {
    if (token === "invalid") throw new Error("Invalid token");
    return {
      uid: "user",
      email_verified: token === "verified",
    } as DecodedIdToken;
  });
  let calls = 0;
  const app = express();
  app.use(express.json());
  app.use(attachRequestAbortSignal);
  app.use(
    "/tcg",
    createTcgRouter(async () => {
      calls++;
      return { data: snapshot, credits, fromDatabase: false };
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  for (const [token, status] of [
    ["", 401],
    ["invalid", 401],
    ["unverified", 403],
    ["verified", 200],
  ] as const) {
    const response = await fetch(`http://127.0.0.1:${address.port}/tcg`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        cardId: "card",
        condition: "nearMint",
        language: "English",
      }),
    });
    assert.equal(response.status, status);
    assert.equal(
      response.headers.get("Cache-Control"),
      "no-store, no-transform",
    );
    await response.body?.cancel();
  }
  assert.equal(calls, 1);
});

test("both calls start concurrently and publish independently before completion", async () => {
  const { deps, signal, input } = fixture();
  let finishSales!: (value: (typeof sale)[]) => void;
  let finishOffers!: (value: {
    offers: (typeof offer)[];
    offersMatched: boolean;
  }) => void;
  const started: string[] = [];
  deps.fetchSales = () => {
    started.push("sold");
    return new Promise((resolve) => {
      finishSales = resolve;
    });
  };
  deps.fetchOffers = () => {
    started.push("active");
    return new Promise((resolve) => {
      finishOffers = resolve;
    });
  };
  const events: MarketplaceSearchEvent<TcgSnapshot>[] = [];
  const pending = requestTcgExplorer("user", input, signal, deps, (event) =>
    events.push(event),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["sold", "active"]);
  finishOffers({ offers: [], offersMatched: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    events.map((e) => e.type),
    ["started", "result"],
  );
  assert.equal(events[1].type === "result" && events[1].side, "active");
  finishSales([sale]);
  const result = await pending;
  assert.equal(result.fromDatabase, false);
  assert.deepEqual(
    events.map((e) => e.type),
    ["started", "result", "result"],
  );
});

test("cached results stream both sides without provider calls and expire after reuseDays", async () => {
  assert.equal(TCG_CACHE_MS, 2 * 24 * 60 * 60 * 1000);
  const { deps, calls, signal, input } = fixture(snapshot);
  const events: MarketplaceSearchEvent<TcgSnapshot>[] = [];
  const result = await requestTcgExplorer(
    "user",
    input,
    signal,
    deps,
    (event) => events.push(event),
  );
  assert.equal(result.fromDatabase, true);
  assert.deepEqual(
    events.map((e) => e.type),
    ["started", "result", "result"],
  );
  assert.equal(calls.sales + calls.offers, 0);
});

test("TCG saves are preserved separately from eBay and exposed on the card object", async () => {
  await ensurePokeTraceReady();
  const id = "tcg-preserved-storage";
  const raw = { id, name: "Charizard", game: "pokemon", market: "US" };
  await pokeTraceDb.execute({
    sql: "INSERT INTO poketrace_cards (id, name, tcgplayer_id, raw_json, saved_responses) VALUES (?, ?, ?, ?, ?)",
    args: [
      id,
      raw.name,
      123,
      JSON.stringify(raw),
      JSON.stringify({ grok: { market_analysis: { score: 5 } }, other: true }),
    ],
  });
  await Promise.all([
    saveTcgSnapshot(id, snapshot),
    saveCardEbayResponse(id, {
      sold: { items: [] },
      active: { items: [] },
      request_query: "Charizard",
    }),
  ]);
  const result = await pokeTraceDb.execute({
    sql: "SELECT saved_responses FROM poketrace_cards WHERE id = ?",
    args: [id],
  });
  const saved = JSON.parse(String(result.rows[0].saved_responses));
  assert.deepEqual(saved.tcg_listings, snapshot);
  assert.ok(saved.ebay);
  assert.deepEqual(saved.grok, { market_analysis: { score: 5 } });
  assert.equal(saved.other, true);
  assert.deepEqual((await getTcgCardContext(id))?.cached, snapshot);
  assert.deepEqual(toPokemonCard(raw, saved).tcg_listings, snapshot);
  await assert.rejects(saveTcgSnapshot(id, { ...snapshot, offers: null }));
});

test("HTTP streaming sends lifecycle events and a terminal error after failures", async (t) => {
  t.mock.method(
    adminAuth,
    "verifyIdToken",
    async () => ({ uid: "user", email_verified: true }) as DecodedIdToken,
  );
  const { deps } = fixture();
  const app = express();
  app.use(express.json());
  app.use(attachRequestAbortSignal);
  app.use(
    "/tcg",
    createTcgRouter((uid, input, signal, _deps, emit) =>
      requestTcgExplorer(uid, input, signal, deps, emit),
    ),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const request = () =>
    fetch(`http://127.0.0.1:${address.port}/tcg?stream=1`, {
      method: "POST",
      headers: {
        Authorization: "Bearer verified",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cardId: "card",
        condition: "all",
        language: "English",
      }),
    });
  const response = await request();
  assert.match(response.headers.get("content-type")!, /application\/x-ndjson/);
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    events.map((e) => e.type),
    ["started", "result", "result", "complete"],
  );
  deps.fetchSales = async () => {
    throw new Error("Unavailable");
  };
  deps.fetchOffers = async () => {
    throw new Error("Unavailable");
  };
  const failed = await request();
  const failures = (await failed.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    failures.map((e) => e.type),
    ["started", "failure", "failure", "error"],
  );
});
