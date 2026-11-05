import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  fetchPokeTraceCard,
  fetchPokeTraceTierPriceHistory,
  fetchPokeTracePriceHistory,
  fetchPokeTracePage,
  fetchPokeTraceSealedProduct,
  fetchPokeTraceSealedPriceHistory,
  fetchPokeTraceSealedPage,
  isEnglishSingle,
  isEnglishUsSealedProduct,
  PokeTraceDailyLimitError,
} from "./pokeTraceApi.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const card = {
  id: "019bff77-befa-771d-bab0-f5909f0a78c9",
  name: "Charizard",
  cardNumber: "004/102",
  game: "pokemon",
  market: "US",
  productType: "single",
  refs: { tcgplayerId: "123456" },
  prices: { tcgplayer: { NEAR_MINT: { avg: 420 } } },
};

const sealedProduct = {
  id: "019bff85-5452-714a-9660-a3559a2d5d95",
  name: "XY Booster Box",
  cardNumber: null,
  set: { slug: "xy-base-set", name: "XY Base Set" },
  rarity: null,
  variant: "Normal",
  productType: "sealed",
  productFamily: "booster_box",
  game: "pokemon",
  market: "US",
  currency: "USD",
  refs: { tcgplayerId: "91601" },
  prices: { tcgplayer: { UNOPENED: { avg: 3900 } } },
};

test("fetches one page for an exact graded tier using all-time history", async () => {
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests += 1;
    const url = new URL(String(input));
    assert.equal(url.pathname, `/v1/cards/${card.id}/prices/BGS_9/history`);
    assert.equal(url.searchParams.get("period"), "all");
    assert.equal(url.searchParams.get("limit"), "365");
    assert.equal(url.searchParams.has("cursor"), false);
    return Response.json({
      data: [],
      pagination: { hasMore: true, nextCursor: "ignored" },
    });
  };
  await fetchPokeTraceTierPriceHistory("test-key", card.id, "BGS_9");
  assert.equal(requests, 1);
  assert.throws(
    () => fetchPokeTraceTierPriceHistory("test-key", card.id, "PSA_11"),
    /Invalid price history tier/,
  );
  assert.throws(
    () => fetchPokeTraceTierPriceHistory("test-key", card.id, "BGS_9_5"),
    /Invalid price history tier/,
  );
  assert.equal(requests, 1);
});

test("requests every supported raw condition through its exact history endpoint", async () => {
  let requestedTier = "";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(
      url.pathname,
      `/v1/cards/${card.id}/prices/${requestedTier}/history`,
    );
    assert.equal(url.searchParams.get("period"), "all");
    assert.equal(url.searchParams.get("limit"), "365");
    return Response.json({ data: [], pagination: { hasMore: false } });
  };
  for (const tier of [
    "MINT",
    "NEAR_MINT",
    "LIGHTLY_PLAYED",
    "MODERATELY_PLAYED",
    "HEAVILY_PLAYED",
    "DAMAGED",
  ] as const) {
    requestedTier = tier;
    await fetchPokeTraceTierPriceHistory("test-key", card.id, tier);
  }
});

test("accepts English US singles and rejects other product lines", () => {
  assert.equal(isEnglishSingle(card), true);
  assert.equal(isEnglishSingle({ ...card, game: "pokemon-japanese" }), false);
  assert.equal(isEnglishSingle({ ...card, productType: "sealed" }), false);
});

test("accepts only English US sealed products with a product family", () => {
  assert.equal(isEnglishUsSealedProduct(sealedProduct), true);
  assert.equal(
    isEnglishUsSealedProduct({ ...sealedProduct, productType: "single" }),
    false,
  );
  assert.equal(
    isEnglishUsSealedProduct({ ...sealedProduct, game: "pokemon-japanese" }),
    false,
  );
  assert.equal(
    isEnglishUsSealedProduct({ ...sealedProduct, productFamily: "" }),
    false,
  );
});

test("fetches only English US sealed products with non-overridable filters", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("game"), "pokemon");
    assert.equal(url.searchParams.get("market"), "US");
    assert.equal(url.searchParams.get("product_type"), "sealed");
    assert.equal(url.searchParams.get("limit"), "20");
    assert.equal(url.searchParams.get("cursor"), "next-page");
    return Response.json({
      data: [sealedProduct],
      pagination: { hasMore: false, nextCursor: null, count: 1 },
    });
  };

  const page = await fetchPokeTraceSealedPage("test-key", {
    cursor: "next-page",
    game: "pokemon-japanese",
    market: "EU",
    product_type: "single",
  });

  assert.equal(page.data[0].productFamily, "booster_box");
  assert.deepEqual(page.data[0].prices, sealedProduct.prices);
});

test("reads one sealed product with its complete current data", async () => {
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      `https://api.poketrace.com/v1/cards/${sealedProduct.id}`,
    );
    return Response.json({ data: sealedProduct });
  };

  assert.deepEqual(
    await fetchPokeTraceSealedProduct("test-key", sealedProduct.id),
    sealedProduct,
  );
});

test("reads the documented paginated card response and preserves prices", async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("game"), "pokemon");
    assert.equal(url.searchParams.get("market"), "US");
    assert.equal(url.searchParams.get("product_type"), "single");
    assert.equal(url.searchParams.get("limit"), "20");
    assert.equal(url.searchParams.get("tcgplayer_ids"), "123456");
    assert.equal(
      (init?.headers as Record<string, string>)["X-API-Key"],
      "test-key",
    );
    return Response.json({
      data: [card],
      pagination: { hasMore: false, nextCursor: null, count: 1 },
    });
  };
  const result = await fetchPokeTracePage("test-key", {
    tcgplayer_ids: "123456",
  });
  assert.equal(result.data[0].id, card.id);
  assert.deepEqual(result.data[0].prices, card.prices);
});

test("reads one card with its complete current prices", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      `https://api.poketrace.com/v1/cards/${card.id}`,
    );
    assert.equal(
      (init?.headers as Record<string, string>)["X-API-Key"],
      "test-key",
    );
    return Response.json({ data: card });
  };

  const result = await fetchPokeTraceCard("test-key", card.id);

  assert.deepEqual(result.prices, card.prices);
});

test("requests only the first page of all-time Near Mint price history", async () => {
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests += 1;
    const url = new URL(String(input));
    assert.equal(url.pathname, `/v1/cards/${card.id}/prices/NEAR_MINT/history`);
    assert.equal(url.searchParams.get("period"), "all");
    assert.equal(url.searchParams.get("limit"), "365");
    assert.equal(
      (init?.headers as Record<string, string>)["X-API-Key"],
      "test-key",
    );
    return Response.json({
      data: [
        {
          date: "2026-09-18",
          source: "tcgplayer",
          avg: 420,
          median7d: 415,
          median30d: 410,
          low: 400,
          high: 440,
          saleCount: 12,
        },
      ],
      pagination: { hasMore: true, nextCursor: "next-page", count: 1 },
    });
  };

  const history = await fetchPokeTracePriceHistory("test-key", card.id);
  assert.equal(requests, 1);
  assert.equal(history.pagination.hasMore, true);

  assert.deepEqual(history.data[0], {
    date: "2026-09-18",
    source: "tcgplayer",
    avg: 420,
    median7d: 415,
    median30d: 410,
    low: 400,
    high: 440,
    saleCount: 12,
    approxSaleCount: null,
  });
});

test("requests only the first page of all-time unopened sealed price history", async () => {
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests += 1;
    const url = new URL(String(input));
    assert.equal(
      url.pathname,
      `/v1/cards/${sealedProduct.id}/prices/UNOPENED/history`,
    );
    assert.equal(url.searchParams.get("period"), "all");
    assert.equal(url.searchParams.get("limit"), "365");
    return Response.json({
      data: [
        {
          date: "2026-10-05",
          source: "tcgplayer",
          avg: 150,
          low: 145,
          high: 160,
          saleCount: 8,
        },
      ],
      pagination: { hasMore: true, nextCursor: "ignored", count: 1 },
    });
  };

  const history = await fetchPokeTraceSealedPriceHistory(
    "test-key",
    sealedProduct.id,
  );

  assert.equal(history.data[0].avg, 150);
  assert.equal(requests, 1);
});

test("daily quota errors are distinguishable from failed requests", async () => {
  globalThis.fetch = async () =>
    Response.json(
      {
        error: "Daily rate limit exceeded",
        usage: { daily: { remaining: 0 } },
      },
      { status: 429 },
    );
  await assert.rejects(
    fetchPokeTracePage("test-key", {}),
    PokeTraceDailyLimitError,
  );
});

test("a burst 429 is retried and the card page is saved", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return requests === 1
      ? Response.json(
          { code: "BURST_RATE_LIMIT_EXCEEDED" },
          { status: 429, headers: { "Retry-After": "1" } },
        )
      : Response.json({
          data: [card],
          pagination: { hasMore: false, nextCursor: null },
        });
  };
  const page = await fetchPokeTracePage("test-key", {});
  assert.equal(requests, 2);
  assert.equal(page.data[0].id, card.id);
});

test("transport and server failures are retried before giving up", async () => {
  let requests = 0;
  const retries: Array<{
    attempt: number;
    maxAttempts: number;
    reason: string;
  }> = [];
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) throw new TypeError("temporary network failure");
    if (requests === 2) {
      return new Response(null, {
        status: 503,
        headers: { "Retry-After": "0.001" },
      });
    }
    return Response.json({
      data: [card],
      pagination: { hasMore: false, nextCursor: null },
    });
  };

  const page = await fetchPokeTracePage(
    "test-key",
    {},
    {
      onRetry: ({ attempt, maxAttempts, reason }) => {
        retries.push({ attempt, maxAttempts, reason });
      },
    },
  );

  assert.equal(requests, 3);
  assert.equal(page.data[0].id, card.id);
  assert.deepEqual(retries, [
    {
      attempt: 1,
      maxAttempts: 2,
      reason: "TypeError: temporary network failure",
    },
    { attempt: 2, maxAttempts: 2, reason: "HTTP 503" },
  ]);
});
