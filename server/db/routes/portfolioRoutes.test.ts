import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import express from "express";
import {
  createHydratedPortfolioHandler,
} from "./portfolioRoutes.js";
import {
  buildPortfolioPriceSourceSelectionUpdate,
  buildSaveJustTcgPriceFailedAtStatement,
  buildSaveJustTcgLookupStatement,
  buildSaveJustTcgPricesStatement,
} from "./portfolioRouteHelpers.js";
import { requestFromTestServer } from "./httpTestServer.js";

test("GET hydrated portfolio returns All mode and reliability payload", async () => {
  const app = express();
  app.get(
    "/api/portfolio/cards/hydrated",
    createHydratedPortfolioHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => [{ cardId: "base1-4", quantity: 2 }],
      loadStoredJustTcgPricesFetchedAt: async () =>
        "2026-08-14T10:00:00.000Z",
      loadHydratedCards: async () => ({
        cards: [
          {
            id: "base1-4",
            quantity: 2,
            priceReliability: {
              tcgplayer: { isFlagged: false },
              cardmarket: { isFlagged: true },
            },
          },
        ],
        missingCardIds: [],
      }),
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/portfolio/cards/hydrated",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    cards: [
      {
        id: "base1-4",
        quantity: 2,
        priceReliability: {
          tcgplayer: { isFlagged: false },
          cardmarket: { isFlagged: true },
        },
      },
    ],
    entries: [{ cardId: "base1-4", quantity: 2 }],
    missingCardIds: [],
    portfolioPriceSource: "all",
    portfolioJustTcgPricesFetchedAt: "2026-08-14T10:00:00.000Z",
  });
});

test("GET hydrated portfolio defaults an absent saved source to All", async () => {
  const app = express();
  app.get(
    "/api/portfolio/cards/hydrated",
    createHydratedPortfolioHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => [],
      loadStoredJustTcgPricesFetchedAt: async () => undefined,
      loadHydratedCards: async () => ({
        cards: [],
        missingCardIds: [],
      }),
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/portfolio/cards/hydrated",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    cards: [],
    entries: [],
    missingCardIds: [],
    portfolioPriceSource: "all",
  });
});

test("JustTCG price save only updates JustTCG prices and updatedAt", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL,
        updated_at TEXT
      )
    `);

    const existingRawJson = {
      id: "base1-4",
      name: "Charizard",
      tcgplayer: {
        prices: { holofoil: { market: 300 } },
        updatedAt: "tcg-date",
      },
      cardmarket: {
        prices: { trendPrice: 250 },
        updatedAt: "cardmarket-date",
      },
      grok: {
        worthGrading: { response: "keep" },
      },
      justtcgLookup: {
        ids: ["pokemon-base-set-charizard-holo-rare"],
        failedAt: null,
      },
      justtcg: {
        url: "https://example.test/justtcg",
        metadata: { sourceUrl: null },
        prices: {
          old: { market: 1 },
        },
        updatedAt: "old-date",
      },
    };

    await client.execute({
      sql: "INSERT INTO cards (id, raw_json) VALUES (?, json(?))",
      args: ["base1-4", JSON.stringify(existingRawJson)],
    });

    await client.execute(
      buildSaveJustTcgPricesStatement("base1-4", {
        prices: {
          "pokemon-base-set-charizard-holo-rare:holofoil-near-mint": {
            market: 800,
          },
        },
        updatedAt: "new-date",
      }),
    );

    const row = (
      await client.execute("SELECT raw_json FROM cards WHERE id = 'base1-4'")
    ).rows[0];
    const raw = JSON.parse(String(row.raw_json)) as typeof existingRawJson;

    assert.deepEqual(raw.tcgplayer, existingRawJson.tcgplayer);
    assert.deepEqual(raw.cardmarket, existingRawJson.cardmarket);
    assert.deepEqual(raw.grok, existingRawJson.grok);
    assert.deepEqual(raw.justtcgLookup, existingRawJson.justtcgLookup);
    assert.equal(raw.justtcg.url, existingRawJson.justtcg.url);
    assert.deepEqual(raw.justtcg.metadata, existingRawJson.justtcg.metadata);
    assert.deepEqual(raw.justtcg.prices, {
      "pokemon-base-set-charizard-holo-rare:holofoil-near-mint": {
        market: 800,
      },
    });
    assert.equal(raw.justtcg.updatedAt, "new-date");
  } finally {
    client.close();
  }
});

test("JustTCG lookup save does not write JustTCG price data", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL,
        updated_at TEXT
      )
    `);

    const existingRawJson = {
      id: "base1-4",
      name: "Charizard",
      tcgplayer: {
        prices: { holofoil: { market: 300 } },
      },
      cardmarket: {
        prices: { trendPrice: 250 },
      },
      justtcg: {
        prices: {
          old: { market: 1 },
        },
        updatedAt: "old-date",
      },
    };

    await client.execute({
      sql: "INSERT INTO cards (id, raw_json) VALUES (?, json(?))",
      args: ["base1-4", JSON.stringify(existingRawJson)],
    });

    await client.execute(
      buildSaveJustTcgLookupStatement("base1-4", {
        ids: ["pokemon-base-set-charizard-holo-rare"],
      }),
    );

    const row = (
      await client.execute("SELECT raw_json FROM cards WHERE id = 'base1-4'")
    ).rows[0];
    const raw = JSON.parse(String(row.raw_json)) as typeof existingRawJson & {
      justtcgLookup: { ids: string[] };
    };

    assert.deepEqual(raw.tcgplayer, existingRawJson.tcgplayer);
    assert.deepEqual(raw.cardmarket, existingRawJson.cardmarket);
    assert.deepEqual(raw.justtcg, existingRawJson.justtcg);
    assert.deepEqual(raw.justtcgLookup, {
      ids: ["pokemon-base-set-charizard-holo-rare"],
    });
  } finally {
    client.close();
  }
});

test("JustTCG price failure save only updates the JustTCG price retry timestamp", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL,
        updated_at TEXT
      )
    `);

    const existingRawJson = {
      id: "base1-4",
      name: "Charizard",
      tcgplayer: {
        prices: { holofoil: { market: 300 } },
      },
      cardmarket: {
        prices: { trendPrice: 250 },
      },
      grok: {
        worthGrading: { response: "keep" },
      },
      justtcgLookup: {
        ids: ["pokemon-base-set-charizard-holo-rare"],
      },
      justtcg: {
        url: "https://example.test/justtcg",
        metadata: { sourceUrl: null },
        prices: {
          old: { market: 1 },
        },
        updatedAt: "old-date",
      },
    };

    await client.execute({
      sql: "INSERT INTO cards (id, raw_json) VALUES (?, json(?))",
      args: ["base1-4", JSON.stringify(existingRawJson)],
    });

    await client.execute(
      buildSaveJustTcgPriceFailedAtStatement(
        "base1-4",
        "2026-08-14T10:00:00.000Z",
      ),
    );

    const row = (
      await client.execute("SELECT raw_json FROM cards WHERE id = 'base1-4'")
    ).rows[0];
    const raw = JSON.parse(String(row.raw_json)) as typeof existingRawJson & {
      justtcg: { priceFailedAt: string };
    };

    assert.deepEqual(raw.tcgplayer, existingRawJson.tcgplayer);
    assert.deepEqual(raw.cardmarket, existingRawJson.cardmarket);
    assert.deepEqual(raw.grok, existingRawJson.grok);
    assert.deepEqual(raw.justtcgLookup, existingRawJson.justtcgLookup);
    assert.equal(raw.justtcg.url, existingRawJson.justtcg.url);
    assert.deepEqual(raw.justtcg.metadata, existingRawJson.justtcg.metadata);
    assert.deepEqual(raw.justtcg.prices, existingRawJson.justtcg.prices);
    assert.equal(raw.justtcg.updatedAt, existingRawJson.justtcg.updatedAt);
    assert.equal(raw.justtcg.priceFailedAt, "2026-08-14T10:00:00.000Z");
  } finally {
    client.close();
  }
});

test("selectForAll saves provider-specific source and All source together", () => {
  const result = buildPortfolioPriceSourceSelectionUpdate(
    {
      cardId: "base1-4",
      quantity: 2,
      priceSources: { cardmarket: "trendPrice" },
      allPriceSource: "cardmarket",
    },
    "tcgplayer",
    "holofoil",
    true,
  );

  assert.deepEqual(result.entry, {
    cardId: "base1-4",
    quantity: 2,
    priceSources: {
      cardmarket: "trendPrice",
      tcgplayer: "holofoil",
    },
    allPriceSource: "tcgplayer",
  });
  assert.deepEqual(result.updates, {
    "priceSources.tcgplayer": "holofoil",
    allPriceSource: "tcgplayer",
  });
});
