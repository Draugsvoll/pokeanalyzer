import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchJustTcgBiggestGainers,
  fetchJustTcgCard,
} from "./justTcgApi.js";

function restoreEnv(
  originalApiKey: string | undefined,
  originalFetch: typeof fetch,
) {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.JUSTTCG_API_KEY;
  } else {
    process.env.JUSTTCG_API_KEY = originalApiKey;
  }
}

test("JustTCG card requests include 180-day price history", async () => {
  const originalApiKey = process.env.JUSTTCG_API_KEY;
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  process.env.JUSTTCG_API_KEY = "test-key";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ data: [] }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    await fetchJustTcgCard("Blaine's Charizard", "2");
  } finally {
    restoreEnv(originalApiKey, originalFetch);
  }

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("include_price_history"), "true");
  assert.equal(url.searchParams.get("priceHistoryDuration"), "180d");
  assert.equal(url.searchParams.get("include_statistics"), "allTime");
});

test("JustTCG biggest gainers request uses safe filters and drops low-price cards", async () => {
  const originalApiKey = process.env.JUSTTCG_API_KEY;
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  process.env.JUSTTCG_API_KEY = "test-key";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        data: [
          {
            name: "Reliable Pikachu",
            number: "25",
            set_name: "Test Set",
            variants: [
              {
                condition: "NM",
                price: 25,
                printing: "Holofoil",
                statistics: {
                  "7d": {
                    priceChange: 4,
                    priceChangePercentage: 19.5,
                  },
                },
              },
            ],
          },
          {
            name: "Tiny Outlier",
            variants: [
              {
                condition: "NM",
                price: 3,
                statistics: {
                  "7d": {
                    priceChangePercentage: 200,
                  },
                },
              },
            ],
          },
        ],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    const result = await fetchJustTcgBiggestGainers();
    assert.equal(result.length, 1);
    assert.equal(result[0].cardName, "Reliable Pikachu");
    assert.equal(result[0].currentPrice, 25);
    assert.equal(result[0].cardNumber, "25");
    assert.equal(result[0].period, "7d");
    assert.equal(result[0].printing, "Holofoil");
  } finally {
    restoreEnv(originalApiKey, originalFetch);
  }

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("game"), "pokemon");
  assert.equal(url.searchParams.get("orderBy"), "7d");
  assert.equal(url.searchParams.get("order"), "desc");
  assert.equal(url.searchParams.get("condition"), "NM");
  assert.equal(url.searchParams.get("include_price_history"), "false");
  assert.equal(url.searchParams.get("include_statistics"), "7d");
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(url.searchParams.get("min_price"), "15");
});

test("JustTCG biggest gainers can use a selected movement period", async () => {
  const originalApiKey = process.env.JUSTTCG_API_KEY;
  const originalFetch = global.fetch;
  process.env.JUSTTCG_API_KEY = "test-key";

  let requestedUrl = "";
  global.fetch = ((url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ data: [] }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    await fetchJustTcgBiggestGainers(undefined, "30d");
  } finally {
    restoreEnv(originalApiKey, originalFetch);
  }

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("orderBy"), "30d");
  assert.equal(url.searchParams.get("include_statistics"), "30d");
});
