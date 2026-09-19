import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  fetchPokeTraceCard,
  fetchPokeTracePage,
  isEnglishSingle,
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

test("accepts English US singles and rejects other product lines", () => {
  assert.equal(isEnglishSingle(card), true);
  assert.equal(isEnglishSingle({ ...card, game: "pokemon-japanese" }), false);
  assert.equal(isEnglishSingle({ ...card, productType: "sealed" }), false);
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
