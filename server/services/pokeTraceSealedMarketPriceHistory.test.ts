import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  loadPokeTraceSealedMarketPriceHistory,
  PokeTraceSealedPriceHistoryUnavailableError,
} from "./pokeTraceSealedMarketPriceHistory.js";

const productId = "019bff85-5452-714a-9660-a3559a2d5d95";
const now = Date.parse("2026-10-05T12:00:00.000Z");

async function createDatabase() {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_sealed_products (
      id TEXT PRIMARY KEY,
      market_price_history TEXT,
      market_price_history_fetched_at TEXT
    )
  `);
  await database.execute({
    sql: "INSERT INTO poketrace_sealed_products (id) VALUES (?)",
    args: [productId],
  });
  return database;
}

const cachedSeries = {
  tcgplayer: [
    {
      date: "2026-10-04",
      avg: 150,
      median7d: null,
      median30d: null,
      low: 145,
      high: 160,
      saleCount: 8,
      approxSaleCount: false,
    },
  ],
};

function apiHistory() {
  return {
    data: [
      {
        date: "2026-10-05",
        source: "tcgplayer",
        avg: 155,
        median7d: null,
        median30d: null,
        low: 150,
        high: 165,
        saleCount: 10,
        approxSaleCount: false,
      },
      {
        date: "2026-10-04",
        source: "unsupported",
        avg: 999,
        median7d: null,
        median30d: null,
        low: null,
        high: null,
        saleCount: null,
        approxSaleCount: null,
      },
    ],
    pagination: { hasMore: false, nextCursor: null },
  };
}

async function saveCachedHistory(
  database: Awaited<ReturnType<typeof createDatabase>>,
  fetchedAt: string,
) {
  await database.execute({
    sql: `
      UPDATE poketrace_sealed_products
      SET market_price_history = ?, market_price_history_fetched_at = ?
      WHERE id = ?
    `,
    args: [
      JSON.stringify({
        condition: "UNOPENED",
        period: "90d",
        currency: "USD",
        fetchedAt,
        series: cachedSeries,
      }),
      fetchedAt,
      productId,
    ],
  });
}

test("sealed graph history stores the unopened API response", async () => {
  const database = await createDatabase();
  let requests = 0;

  try {
    const history = await loadPokeTraceSealedMarketPriceHistory(productId, {
      apiKey: "test-key",
      database,
      now: () => now,
      ready: Promise.resolve(),
      fetchHistory: async (apiKey, id) => {
        requests += 1;
        assert.equal(apiKey, "test-key");
        assert.equal(id, productId);
        return apiHistory();
      },
    });

    assert.equal(requests, 1);
    assert.equal(history?.condition, "UNOPENED");
    assert.equal(history?.stale, false);
    assert.equal(history?.fetchedAt, "2026-10-05T12:00:00.000Z");
    assert.equal(history?.series.tcgplayer?.[0].avg, 155);
    assert.equal(Object.keys(history?.series ?? {}).length, 1);

    const saved = await database.execute({
      sql: `
        SELECT market_price_history, market_price_history_fetched_at
        FROM poketrace_sealed_products
        WHERE id = ?
      `,
      args: [productId],
    });
    assert.equal(
      saved.rows[0].market_price_history_fetched_at,
      "2026-10-05T12:00:00.000Z",
    );
    assert.match(String(saved.rows[0].market_price_history), /"UNOPENED"/);
  } finally {
    database.close();
  }
});

test("sealed graph history returns a cache younger than six hours", async () => {
  const database = await createDatabase();
  await saveCachedHistory(database, "2026-10-05T06:00:01.000Z");
  let requests = 0;

  try {
    const history = await loadPokeTraceSealedMarketPriceHistory(productId, {
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
    assert.equal(history?.series.tcgplayer?.[0].avg, 150);
  } finally {
    database.close();
  }
});

test("sealed graph history deduplicates concurrent refreshes", async () => {
  const database = await createDatabase();
  let requests = 0;
  let releaseFetch!: () => void;
  let markFetchStarted!: () => void;
  const fetchStarted = new Promise<void>((resolve) => {
    markFetchStarted = resolve;
  });
  const fetchReleased = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  const dependencies = {
    apiKey: "test-key",
    database,
    now: () => now,
    ready: Promise.resolve(),
    fetchHistory: async () => {
      requests += 1;
      markFetchStarted();
      await fetchReleased;
      return apiHistory();
    },
  };

  try {
    const first = loadPokeTraceSealedMarketPriceHistory(
      productId,
      dependencies,
    );
    await fetchStarted;
    const second = loadPokeTraceSealedMarketPriceHistory(
      productId,
      dependencies,
    );
    releaseFetch();
    const [firstHistory, secondHistory] = await Promise.all([first, second]);

    assert.equal(requests, 1);
    assert.equal(firstHistory, secondHistory);
  } finally {
    database.close();
  }
});

test("sealed graph history serves an expired cache when refresh fails", async () => {
  const database = await createDatabase();
  await saveCachedHistory(database, "2026-10-05T05:59:59.000Z");

  try {
    const history = await loadPokeTraceSealedMarketPriceHistory(productId, {
      apiKey: "test-key",
      database,
      now: () => now,
      ready: Promise.resolve(),
      fetchHistory: async () => {
        throw new Error("upstream unavailable");
      },
    });

    assert.equal(history?.stale, true);
    assert.equal(history?.series.tcgplayer?.[0].avg, 150);
  } finally {
    database.close();
  }
});

test("sealed graph history requires API configuration without a cache", async () => {
  const database = await createDatabase();

  try {
    await assert.rejects(
      loadPokeTraceSealedMarketPriceHistory(productId, {
        apiKey: "",
        database,
        ready: Promise.resolve(),
      }),
      PokeTraceSealedPriceHistoryUnavailableError,
    );
  } finally {
    database.close();
  }
});
