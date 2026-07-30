import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createHydratedPortfolioHandler,
  createUpdatePortfolioPriceSourceHandler,
  savePortfolioPriceSourcePreference,
} from "./portfolioRoutes.js";
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
    message: "priceSource must be tcgplayer or cardmarket",
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

test("GET hydrated portfolio defaults an absent saved source to TCGPlayer", async () => {
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
    portfolioPriceSource: "tcgplayer",
  });
});
