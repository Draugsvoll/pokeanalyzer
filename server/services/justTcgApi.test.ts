import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchJustTcgBiggestGainers,
  fetchJustTcgCard,
  fetchJustTcgPortfolioPricesByCardIds,
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
          {
            name: "Reliable Bulbasaur",
            set_name: "Test Set",
            variants: [
              {
                condition: "Lightly Played",
                price: 18,
                printing: "Normal",
                statistics: {
                  "7d": {
                    priceChange: 3,
                    priceChangePercentage: 16.7,
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
    assert.equal(result.length, 2);
    assert.equal(result[0].cardName, "Reliable Pikachu");
    assert.equal(result[0].currentPrice, 25);
    assert.equal(result[0].period, "7d");
    assert.equal(result[0].printing, "Holofoil");
    assert.equal(result[1].cardName, "Reliable Bulbasaur");
    assert.equal(result[1].condition, "Lightly Played");
  } finally {
    restoreEnv(originalApiKey, originalFetch);
  }

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("game"), "pokemon");
  assert.equal(url.searchParams.get("orderBy"), "7d");
  assert.equal(url.searchParams.get("order"), "desc");
  assert.equal(url.searchParams.get("condition"), "NM,LP");
  assert.equal(url.searchParams.get("include_price_history"), "false");
  assert.equal(url.searchParams.get("include_statistics"), "7d");
  assert.equal(url.searchParams.get("limit"), "20");
  assert.equal(url.searchParams.get("min_price"), "15");
});

test("JustTCG biggest gainers can use a selected movement period", async () => {
  const originalApiKey = process.env.JUSTTCG_API_KEY;
  const originalFetch = global.fetch;
  process.env.JUSTTCG_API_KEY = "test-key";

  let requestedUrl = "";
  global.fetch = (async (url: string | URL | Request) => {
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

test("JustTCG portfolio batch requests one row per card ID", async () => {
  const originalApiKey = process.env.JUSTTCG_API_KEY;
  const originalFetch = global.fetch;
  process.env.JUSTTCG_API_KEY = "test-key";

  const requestedBodies: unknown[] = [];
  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestedBodies.push(
      typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    );
    return new Response(JSON.stringify({ data: [] }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    await fetchJustTcgPortfolioPricesByCardIds([
      "justtcg-card-one",
      "justtcg-card-two",
      "justtcg-card-three",
    ]);
  } finally {
    restoreEnv(originalApiKey, originalFetch);
  }

  assert.deepEqual(requestedBodies, [
    [
      { cardId: "justtcg-card-one" },
      { cardId: "justtcg-card-two" },
      { cardId: "justtcg-card-three" },
    ],
  ]);
});

test("JustTCG portfolio batch keeps outbound bodies at twenty rows or fewer", async () => {
  const originalApiKey = process.env.JUSTTCG_API_KEY;
  const originalFetch = global.fetch;
  process.env.JUSTTCG_API_KEY = "test-key";

  const rowCounts: number[] = [];
  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : [];
    rowCounts.push(Array.isArray(body) ? body.length : 0);
    return new Response(JSON.stringify({ data: [] }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    await fetchJustTcgPortfolioPricesByCardIds([
      "justtcg-card-one",
      "justtcg-card-two",
      "justtcg-card-three",
      "justtcg-card-four",
      "justtcg-card-five",
      "justtcg-card-six",
      "justtcg-card-seven",
      "justtcg-card-eight",
      "justtcg-card-nine",
      "justtcg-card-ten",
      "justtcg-card-eleven",
      "justtcg-card-twelve",
      "justtcg-card-thirteen",
      "justtcg-card-fourteen",
      "justtcg-card-fifteen",
      "justtcg-card-sixteen",
      "justtcg-card-seventeen",
      "justtcg-card-eighteen",
      "justtcg-card-nineteen",
      "justtcg-card-twenty",
      "justtcg-card-twenty-one",
    ]);
  } finally {
    restoreEnv(originalApiKey, originalFetch);
  }

  assert.deepEqual(rowCounts, [20, 1]);
});

test("JustTCG portfolio batch preserves card IDs and conditions across split requests", async () => {
  const originalApiKey = process.env.JUSTTCG_API_KEY;
  const originalFetch = global.fetch;
  process.env.JUSTTCG_API_KEY = "test-key";

  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : [];
    const rows = Array.isArray(body) ? body : [];

    return new Response(
      JSON.stringify({
        data: rows.map((row) => ({
          id: row.cardId,
          name: row.cardId,
          number: "1",
          set_name: "Test Set",
          variants: [
            {
              condition: "Near Mint",
              price: 10,
              printing: "Holofoil",
            },
            {
              condition: "Lightly Played",
              price: 20,
              printing: "Holofoil",
            },
          ],
        })),
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  }) as typeof fetch;

  try {
    const result = await fetchJustTcgPortfolioPricesByCardIds([
      "justtcg-card-one",
      "justtcg-card-two",
      "justtcg-card-three",
      "justtcg-card-four",
      "justtcg-card-five",
      "justtcg-card-six",
      "justtcg-card-seven",
      "justtcg-card-eight",
      "justtcg-card-nine",
      "justtcg-card-ten",
      "justtcg-card-eleven",
      "justtcg-card-twelve",
      "justtcg-card-thirteen",
      "justtcg-card-fourteen",
      "justtcg-card-fifteen",
      "justtcg-card-sixteen",
      "justtcg-card-seventeen",
      "justtcg-card-eighteen",
      "justtcg-card-nineteen",
      "justtcg-card-twenty",
      "justtcg-card-twenty-one",
    ]);

    assert.equal(
      result["justtcg-card-one:holofoil-near-mint"]?.market,
      10,
    );
    assert.equal(
      result["justtcg-card-one:holofoil-lightly-played"]?.market,
      20,
    );
    assert.equal(
      result["justtcg-card-three:holofoil-near-mint"]?.market,
      10,
    );
    assert.equal(
      result["justtcg-card-three:holofoil-lightly-played"]?.market,
      20,
    );
  } finally {
    restoreEnv(originalApiKey, originalFetch);
  }
});
