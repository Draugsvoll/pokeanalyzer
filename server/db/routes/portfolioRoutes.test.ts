import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import express from "express";
import {
  createHydratedPortfolioHandler,
  createUpdatePortfolioPriceSourceHandler,
  savePortfolioPriceSourcePreference,
} from "./portfolioRoutes.js";
import {
  buildPortfolioPriceSourceSelectionUpdate,
  buildSaveJustTcgPricesStatement,
} from "./portfolioRouteHelpers.js";
import { requestFromTestServer } from "./httpTestServer.js";

test("PATCH price-source validates and saves the global portfolio source", async () => {
  const saves: Array<{ uid: string; priceSource: string }> = [];
  const app = express();
  app.use(express.json());
  app.patch(
    "/api/portfolio/price-source",
    createUpdatePortfolioPriceSourceHandler({
      authenticatedUid: () => "user-123",
      savePriceSource: async (uid, priceSource) => {
        saves.push({ uid, priceSource });
      },
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/portfolio/price-source",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priceSource: "cardmarket" }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    portfolioPriceSource: "cardmarket",
  });
  assert.deepEqual(saves, [{ uid: "user-123", priceSource: "cardmarket" }]);
});

test("PATCH price-source accepts and saves All mode", async () => {
  const saves: Array<{ uid: string; priceSource: string }> = [];
  const app = express();
  app.use(express.json());
  app.patch(
    "/api/portfolio/price-source",
    createUpdatePortfolioPriceSourceHandler({
      authenticatedUid: () => "user-123",
      savePriceSource: async (uid, priceSource) => {
        saves.push({ uid, priceSource });
      },
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/portfolio/price-source",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priceSource: "all" }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { portfolioPriceSource: "all" });
  assert.deepEqual(saves, [{ uid: "user-123", priceSource: "all" }]);
});

test("PATCH price-source rejects unsupported values before writing", async () => {
  let saveCount = 0;
  const app = express();
  app.use(express.json());
  app.patch(
    "/api/portfolio/price-source",
    createUpdatePortfolioPriceSourceHandler({
      authenticatedUid: () => "user-123",
      savePriceSource: async () => {
        saveCount += 1;
      },
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/portfolio/price-source",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priceSource: "ebay" }),
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: "priceSource must be all, tcgplayer, cardmarket, or justtcg",
  });
  assert.equal(saveCount, 0);
});

test("the saved preference uses a merge write and preserves other user fields", async () => {
  const storedUser: Record<string, unknown> = {
    displayName: "Ove",
    credits: 12,
  };

  await savePortfolioPriceSourcePreference(
    {
      set: async (data, options) => {
        assert.deepEqual(options, { merge: true });
        Object.assign(storedUser, data);
      },
    },
    "cardmarket",
  );

  assert.deepEqual(storedUser, {
    displayName: "Ove",
    credits: 12,
    portfolioPriceSource: "cardmarket",
  });
});

test("GET hydrated portfolio returns the saved source and reliability payload", async () => {
  const app = express();
  app.get(
    "/api/portfolio/cards/hydrated",
    createHydratedPortfolioHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => [{ cardId: "base1-4", quantity: 2 }],
      loadStoredPriceSource: async () => "cardmarket",
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
    portfolioPriceSource: "cardmarket",
  });
});

test("GET hydrated portfolio defaults an absent saved source to All", async () => {
  const app = express();
  app.get(
    "/api/portfolio/cards/hydrated",
    createHydratedPortfolioHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => [],
      loadStoredPriceSource: async () => undefined,
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
