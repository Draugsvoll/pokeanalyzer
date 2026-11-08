import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  loadMarketPriceHistory,
  PokeTracePriceHistoryTierUnavailableError,
} from "./pokeTraceMarketPriceHistory.js";
import {
  qualifyingGradedHistoryTiers,
  type GradedHistoryTier,
} from "../../shared/pokeTraceHistoryTiers.js";

const cardId = "019bff77-befa-771d-bab0-f5909f0a78c9";
const now = Date.parse("2026-09-19T12:00:00.000Z");
const lastUpdated = new Date(now).toISOString();

async function createDatabase(
  raw: Record<string, unknown> = { currency: "USD" },
) {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_cards (
      id TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL,
      market_price_history TEXT,
      market_price_history_fetched_at TEXT
    )
  `);
  await database.execute(`
    CREATE TABLE poketrace_graded_price_history (
      card_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (card_id, tier)
    )
  `);
  await database.execute({
    sql: "INSERT INTO poketrace_cards (id, raw_json) VALUES (?, ?)",
    args: [
      cardId,
      JSON.stringify({
        ...raw,
        markets: {
          US: { available: true, currency: "USD" },
          EU: { available: true, currency: "EUR" },
        },
        prices: nativePrices(raw.prices),
      }),
    ],
  });
  return database;
}

function nativePrices(prices: unknown) {
  const ebay = (prices as { ebay?: Record<string, unknown> })?.ebay ?? {};
  return Object.fromEntries(
    Object.entries(ebay).map(([tier, price]) => [
      tier,
      { US: { ebay: price } },
    ]),
  );
}

function storedUS(value: Record<string, unknown>) {
  return JSON.stringify({ US: { ...value, market: "US" } });
}

const cachedSeries = {
  tcgplayer: [
    {
      date: "2026-09-18",
      avg: 420,
      low: null,
      high: null,
      saleCount: null,
      approxSaleCount: null,
    },
  ],
};

test("US and EU requests keep independent caches and preserve concurrent writes", async () => {
  const database = await createDatabase();
  const fetchHistory = async (
    _key: string,
    _id: string,
    options?: { market?: "US" | "EU" },
  ) => ({
    data: [
      {
        date: "2026-09-18",
        source: options?.market === "EU" ? "cardmarket_unsold" : "ebay",
        avg: options?.market === "EU" ? 75 : 100,
        median7d: null,
        median30d: null,
        low: null,
        high: null,
        saleCount: 20,
        approxSaleCount: false,
      },
    ],
    pagination: { hasMore: false, nextCursor: null },
  });
  try {
    const dependencies = {
      database,
      ready: Promise.resolve(),
      apiKey: "test-key",
      now: () => now,
      fetchHistory,
    };
    const [us, eu] = await Promise.all([
      loadMarketPriceHistory(cardId, { ...dependencies, market: "US" }),
      loadMarketPriceHistory(cardId, { ...dependencies, market: "EU" }),
    ]);
    assert.equal(us?.currency, "USD");
    assert.equal(eu?.currency, "EUR");
    assert.equal(eu?.series.cardmarket_unsold?.[0].avg, 75);
    assert.equal(eu?.series.ebay, undefined);
    const saved = await database.execute(
      "SELECT market_price_history FROM poketrace_cards",
    );
    const payload = JSON.parse(String(saved.rows[0].market_price_history));
    assert.equal(payload.US.series.ebay[0].avg, 100);
    assert.equal(payload.EU.series.cardmarket_unsold[0].avg, 75);
    const noFetch = async () => {
      throw new Error("A fresh market cache must be reused");
    };
    for (const market of ["US", "EU"] as const) {
      assert.equal(
        (
          await loadMarketPriceHistory(cardId, {
            ...dependencies,
            market,
            fetchHistory: noFetch,
          })
        )?.market,
        market,
      );
    }
  } finally {
    database.close();
  }
});

test("a fresh US cache cannot hide an expired EU cache", async () => {
  const database = await createDatabase();
  const payload = {
    US: {
      condition: "NEAR_MINT",
      market: "US",
      currency: "USD",
      period: "1y",
      fetchedAt: new Date(now).toISOString(),
      series: cachedSeries,
    },
    EU: {
      condition: "NEAR_MINT",
      market: "EU",
      currency: "EUR",
      period: "1y",
      fetchedAt: new Date(now - 7 * 3600_000).toISOString(),
      series: {},
    },
  };
  try {
    await database.execute({
      sql: "UPDATE poketrace_cards SET market_price_history = ?",
      args: [JSON.stringify(payload)],
    });
    let requests = 0;
    const result = await loadMarketPriceHistory(cardId, {
      database,
      ready: Promise.resolve(),
      apiKey: "test-key",
      market: "EU",
      now: () => now,
      fetchHistory: async () => {
        requests++;
        return { data: [], pagination: { hasMore: false, nextCursor: null } };
      },
    });
    assert.equal(requests, 1);
    assert.equal(result?.fetchedAt, new Date(now).toISOString());
    const saved = await database.execute(
      "SELECT market_price_history FROM poketrace_cards",
    );
    assert.deepEqual(
      JSON.parse(String(saved.rows[0].market_price_history)).US,
      payload.US,
    );
  } finally {
    database.close();
  }
});

test("graded eligibility uses the selected market's own counts, prices, and dates", () => {
  const prices = {
    PSA_10: {
      US: { ebay: { avg: 800, saleCount: 100, lastUpdated } },
      EU: { cardmarket_unsold: { avg: 700, saleCount: 14, lastUpdated } },
    },
    PSA_9: {
      US: { ebay: { avg: 300, saleCount: 0, lastUpdated } },
      EU: { cardmarket_unsold: { median30d: 250, saleCount: 15, lastUpdated } },
    },
    PSA_8: {
      EU: {
        cardmarket_unsold: {
          avg: 100,
          saleCount: 50,
          lastUpdated: "2025-01-01",
        },
      },
    },
  };
  assert.deepEqual(qualifyingGradedHistoryTiers(prices, undefined, now, "US"), [
    "PSA_10",
  ]);
  assert.deepEqual(qualifyingGradedHistoryTiers(prices, undefined, now, "EU"), [
    "PSA_9",
  ]);
});

test("stores TCGPlayer and eBay Near Mint history from one request", async () => {
  const database = await createDatabase();
  let requests = 0;
  const history = await loadMarketPriceHistory(cardId, {
    apiKey: "test-key",
    database,
    now: () => now,
    ready: Promise.resolve(),
    fetchHistory: async () => {
      requests += 1;
      return {
        data: [
          {
            date: "2026-09-18",
            source: "ebay",
            avg: 500,
            median7d: 475,
            median30d: 460,
            low: 450,
            high: 550,
            saleCount: 5,
            approxSaleCount: true,
          },
          {
            date: "2026-09-18",
            source: "tcgplayer",
            avg: 420,
            median7d: 418,
            median30d: 415,
            low: 400,
            high: 440,
            saleCount: 12,
            approxSaleCount: null,
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      };
    },
  });

  assert.equal(requests, 1);
  assert.equal(history?.period, "1y");
  assert.equal(history?.series.tcgplayer?.[0].avg, 420);
  assert.equal(history?.series.ebay?.[0].avg, 500);
  assert.equal(history?.series.ebay?.[0].median7d, 475);
  const saved = await database.execute({
    sql: "SELECT market_price_history, market_price_history_fetched_at FROM poketrace_cards WHERE id = ?",
    args: [cardId],
  });
  assert.equal(
    saved.rows[0].market_price_history_fetched_at,
    "2026-09-19T12:00:00.000Z",
  );
  assert.match(String(saved.rows[0].market_price_history), /"tcgplayer"/);
  assert.match(String(saved.rows[0].market_price_history), /"ebay"/);
  database.close();
});

test("qualifies only available graded eBay tiers with a price and at least 15 sales", () => {
  const prices = {
    ebay: {
      PSA_10: { avg: 500, saleCount: 15, lastUpdated },
      PSA_9: { avg: 300, saleCount: 14, lastUpdated },
      BGS_9: { median30d: 400, saleCount: 25, lastUpdated },
      BGS_9_5: { median30d: 450, saleCount: 25, lastUpdated },
      PSA_5: { avg: 200, saleCount: 15, lastUpdated },
      CGC_10: { avg: 500, saleCount: null, lastUpdated },
      SGC_10: { avg: null, saleCount: 30, lastUpdated },
      ACE_10: { avg: 200, saleCount: 17, lastUpdated },
      TAG_10: { avg: 200, saleCount: 16, lastUpdated },
      FAKE_10: { avg: 500, saleCount: 30, lastUpdated },
      PSA_11: { avg: 500, saleCount: 30, lastUpdated },
      PSA_9_99: { avg: 500, saleCount: 30, lastUpdated },
      NEAR_MINT: { avg: 20, saleCount: 100 },
    },
  };
  assert.deepEqual(
    qualifyingGradedHistoryTiers(nativePrices(prices), undefined, now),
    ["ACE_10", "BGS_9", "PSA_5", "PSA_10", "TAG_10"],
  );
  assert.deepEqual(
    qualifyingGradedHistoryTiers(nativePrices(prices), ["PSA_10"], now),
    ["PSA_10"],
  );
  assert.deepEqual(
    qualifyingGradedHistoryTiers(nativePrices(prices), [], now),
    [],
  );
});

const gradedCard = {
  currency: "USD",
  gradedOptions: ["PSA_10", "PSA_9", "BGS_9", "BGS_9_5"],
  prices: {
    ebay: {
      PSA_10: { avg: 500, saleCount: 15, lastUpdated },
      PSA_9: { avg: 300, saleCount: 14, lastUpdated },
      BGS_9: { median30d: 400, saleCount: 25, lastUpdated },
      BGS_9_5: { median30d: 450, saleCount: 25, lastUpdated },
      CGC_10: { avg: 500, saleCount: 20, lastUpdated },
    },
  },
};

test("graded freshness uses an inclusive two-calendar-month UTC cutoff, including short months and leap years", () => {
  for (const [current, cutoff] of [
    ["2026-11-04T12:00:00Z", "2026-09-04T00:00:00Z"],
    ["2026-04-30T12:00:00Z", "2026-02-28T00:00:00Z"],
    ["2024-04-30T12:00:00Z", "2024-02-29T00:00:00Z"],
    ["2027-01-31T12:00:00Z", "2026-11-30T00:00:00Z"],
  ]) {
    const time = Date.parse(current);
    const updates = {
      PSA_10: cutoff,
      PSA_9: new Date(Date.parse(cutoff) - 1).toISOString(),
      PSA_8: current,
      PSA_7: undefined,
      PSA_6: "not-a-date",
      PSA_5: new Date(time + 1).toISOString(),
    };
    const ebay = Object.fromEntries(
      Object.entries(updates).map(([tier, updated]) => [
        tier,
        { avg: 100, saleCount: 15, lastUpdated: updated },
      ]),
    );
    assert.deepEqual(
      qualifyingGradedHistoryTiers(nativePrices({ ebay }), undefined, time),
      ["PSA_8", "PSA_10"],
      current,
    );
  }
});

test("stale or invalid grade updates cannot fetch or reuse an otherwise fresh cache", async () => {
  for (const updated of [
    "2026-07-18T23:59:59Z",
    undefined,
    "invalid",
    "2026-09-20T00:00:00Z",
  ]) {
    const database = await createDatabase({
      ...gradedCard,
      prices: {
        ebay: { PSA_10: { avg: 500, saleCount: 15, lastUpdated: updated } },
      },
    });
    try {
      await database.execute({
        sql: "INSERT INTO poketrace_graded_price_history (card_id, tier, payload_json, fetched_at) VALUES (?, ?, ?, ?)",
        args: [
          cardId,
          "PSA_10",
          storedUS({
            condition: "PSA_10",
            period: "1y",
            currency: "USD",
            fetchedAt: lastUpdated,
            series: { ebay: cachedSeries.tcgplayer },
          }),
          lastUpdated,
        ],
      });
      await assert.rejects(
        loadMarketPriceHistory(cardId, {
          database,
          ready: Promise.resolve(),
          apiKey: "test-key",
          tier: "PSA_10",
          now: () => now,
          fetchHistory: async () => assert.fail("stale grades must not fetch"),
        }),
        PokeTracePriceHistoryTierUnavailableError,
      );
    } finally {
      database.close();
    }
  }
});

test("raw condition histories keep both sources and reuse isolated caches, including empty results", async (context) => {
  const database = await createDatabase();
  let requests = 0;
  context.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0]) => {
      requests += 1;
      const url = new URL(String(input));
      const data = url.pathname.includes("/MINT/")
        ? []
        : [
            { date: "2026-09-18", source: "tcgplayer", avg: 10, median7d: 12 },
            { date: "2026-09-18", source: "ebay", avg: 20, median7d: 22 },
          ];
      return Response.json({ data, pagination: { hasMore: false } });
    },
  );
  const load = (tier: "LIGHTLY_PLAYED" | "DAMAGED" | "MINT") =>
    loadMarketPriceHistory(cardId, {
      database,
      ready: Promise.resolve(),
      apiKey: "test-key",
      tier,
      now: () => now,
    });
  try {
    const lightlyPlayed = await load("LIGHTLY_PLAYED");
    assert.equal(lightlyPlayed?.condition, "LIGHTLY_PLAYED");
    assert.equal(lightlyPlayed?.series.tcgplayer?.[0].avg, 10);
    assert.equal(lightlyPlayed?.series.ebay?.[0].avg, 20);
    assert.equal((await load("DAMAGED"))?.condition, "DAMAGED");
    assert.deepEqual((await load("MINT"))?.series, {});
    assert.equal(requests, 3);
    assert.equal((await load("LIGHTLY_PLAYED"))?.stale, false);
    assert.deepEqual((await load("MINT"))?.series, {});
    assert.equal(requests, 3);
    assert.equal(
      (
        await database.execute(
          "SELECT COUNT(*) AS count FROM poketrace_graded_price_history",
        )
      ).rows[0].count,
      3,
    );
    assert.equal(
      (
        await database.execute(
          "SELECT market_price_history FROM poketrace_cards",
        )
      ).rows[0].market_price_history,
      null,
    );
  } finally {
    database.close();
  }
});

test("fetches the exact qualifying tier through the graded API endpoint", async (context) => {
  const database = await createDatabase(gradedCard);
  context.mock.method(
    globalThis,
    "fetch",
    async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, `/v2/cards/${cardId}/prices/BGS_9/history`);
      assert.equal(url.searchParams.get("period"), "1y");
      return Response.json({
        data: [{ date: "2026-09-18", source: "ebay", avg: 400, median7d: 390 }],
        pagination: { hasMore: false },
      });
    },
  );
  try {
    const result = await loadMarketPriceHistory(cardId, {
      database,
      ready: Promise.resolve(),
      apiKey: "test-key",
      tier: "BGS_9",
      now: () => now,
    });
    assert.equal(result?.condition, "BGS_9");
    assert.equal(result?.series.ebay?.[0].median7d, 390);
  } finally {
    database.close();
  }
});

test("rejects grades below 15 sales, missing prices, and unadvertised tiers before fetching", async () => {
  const database = await createDatabase(gradedCard);
  try {
    for (const tier of ["PSA_9", "CGC_10", "TAG_10", "BGS_9_5"] as const) {
      await assert.rejects(
        loadMarketPriceHistory(cardId, {
          database,
          ready: Promise.resolve(),
          apiKey: "test-key",
          tier,
          now: () => now,
          fetchHistory: async () =>
            assert.fail("unqualified tiers must not fetch"),
        }),
        PokeTracePriceHistoryTierUnavailableError,
      );
    }
  } finally {
    database.close();
  }
});

test("caches graded histories separately from other grades and Near Mint", async () => {
  const database = await createDatabase(gradedCard);
  let requests = 0;
  const loadTier = (
    tier: GradedHistoryTier,
    price: number,
    time = now,
    fail = false,
  ) =>
    loadMarketPriceHistory(cardId, {
      database,
      ready: Promise.resolve(),
      apiKey: "test-key",
      tier,
      now: () => time,
      fetchHistory: async () => {
        requests += 1;
        if (fail) throw new Error("upstream unavailable");
        return {
          data: [
            {
              date: "2026-09-18",
              source: "ebay",
              avg: null,
              median7d: price,
              median30d: price + 10,
              low: null,
              high: null,
              saleCount: 1,
              approxSaleCount: null,
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
        };
      },
    });
  try {
    await loadTier("PSA_10", 475);
    await loadTier("BGS_9", 390);
    const cached = await loadTier("PSA_10", 999);
    assert.equal(requests, 2);
    assert.equal(cached?.condition, "PSA_10");
    assert.equal(cached?.series.ebay?.[0].median7d, 475);
    assert.equal(cached?.series.ebay?.[0].avg, 485);
    assert.equal(cached?.stale, false);
    const stale = await loadTier("BGS_9", 999, now + 7 * 60 * 60 * 1000, true);
    assert.equal(stale?.condition, "BGS_9");
    assert.equal(stale?.series.ebay?.[0].median7d, 390);
    assert.equal(stale?.series.ebay?.[0].avg, 400);
    assert.equal(stale?.stale, true);
    assert.equal(
      (
        await database.execute(
          "SELECT COUNT(*) AS count FROM poketrace_graded_price_history",
        )
      ).rows[0].count,
      2,
    );
    assert.equal(
      (
        await database.execute(
          "SELECT market_price_history FROM poketrace_cards",
        )
      ).rows[0].market_price_history,
      null,
    );
  } finally {
    database.close();
  }
});

test("returns a cache younger than six hours without an upstream request", async () => {
  const database = await createDatabase();
  const fetchedAt = "2026-09-19T07:00:01.000Z";
  await database.execute({
    sql: `
      UPDATE poketrace_cards
      SET market_price_history = ?, market_price_history_fetched_at = ?
      WHERE id = ?
    `,
    args: [
      storedUS({
        condition: "NEAR_MINT",
        period: "1y",
        currency: "USD",
        fetchedAt,
        series: cachedSeries,
      }),
      fetchedAt,
      cardId,
    ],
  });
  let requests = 0;

  const history = await loadMarketPriceHistory(cardId, {
    apiKey: "test-key",
    database,
    now: () => now,
    ready: Promise.resolve(),
    fetchHistory: async () => {
      requests += 1;
      throw new Error("must not fetch");
    },
  });

  assert.equal(requests, 0);
  assert.equal(history?.stale, false);
  assert.equal(history?.series.tcgplayer?.[0].avg, 420);
  database.close();
});

test("does not reuse an unsupported history cache period", async () => {
  const database = await createDatabase();
  const fetchedAt = new Date(now).toISOString();
  await database.execute({
    sql: "UPDATE poketrace_cards SET market_price_history = ?, market_price_history_fetched_at = ? WHERE id = ?",
    args: [
      storedUS({
        condition: "NEAR_MINT",
        period: "90d",
        currency: "USD",
        fetchedAt,
        series: cachedSeries,
      }),
      fetchedAt,
      cardId,
    ],
  });
  let requests = 0;
  const history = await loadMarketPriceHistory(cardId, {
    apiKey: "test-key",
    database,
    now: () => now,
    ready: Promise.resolve(),
    fetchHistory: async () => {
      requests += 1;
      return { data: [], pagination: { hasMore: true, nextCursor: "ignored" } };
    },
  });
  assert.equal(requests, 1);
  assert.equal(history?.period, "1y");
  assert.equal(history?.stale, false);
  database.close();
});

test("serves saved history as stale when a refresh fails", async () => {
  const database = await createDatabase();
  const fetchedAt = "2026-09-19T05:59:59.000Z";
  await database.execute({
    sql: `
      UPDATE poketrace_cards
      SET market_price_history = ?, market_price_history_fetched_at = ?
      WHERE id = ?
    `,
    args: [
      storedUS({
        condition: "NEAR_MINT",
        period: "1y",
        currency: "USD",
        fetchedAt,
        series: cachedSeries,
      }),
      fetchedAt,
      cardId,
    ],
  });

  const history = await loadMarketPriceHistory(cardId, {
    apiKey: "test-key",
    database,
    now: () => now,
    ready: Promise.resolve(),
    fetchHistory: async () => {
      throw new Error("upstream unavailable");
    },
  });

  assert.equal(history?.stale, true);
  assert.equal(history?.series.tcgplayer?.[0].avg, 420);
  database.close();
});
