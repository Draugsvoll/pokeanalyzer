import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createHydratedPortfolioHandler } from "./portfolioRoutes.js";
import { requestFromTestServer } from "./httpTestServer.js";

const pokeTraceCardId = "019bff77-befa-771d-bab0-f5909f0a78c9";

test("GET hydrated portfolio returns PokeTrace cards with price snapshots", async () => {
  const app = express();
  app.get(
    "/api/portfolio/cards/hydrated",
    createHydratedPortfolioHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => [{ cardId: pokeTraceCardId, quantity: 2 }],
      loadHydratedCards: async () => ({
        cards: [
          {
            id: pokeTraceCardId,
            quantity: 2,
            priceSnapshots: {
              "1d": {
                recordedAt: "2026-09-16",
                marketPrice: 410,
                sourceUpdatedAt: "2026-09-16T08:00:00.000Z",
              },
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
        id: pokeTraceCardId,
        quantity: 2,
        priceSnapshots: {
          "1d": {
            recordedAt: "2026-09-16",
            marketPrice: 410,
            sourceUpdatedAt: "2026-09-16T08:00:00.000Z",
          },
        },
      },
    ],
    entries: [{ cardId: pokeTraceCardId, quantity: 2 }],
    missingCardIds: [],
  });
});

test("GET hydrated portfolio supports an empty PokeTrace portfolio", async () => {
  const app = express();
  app.get(
    "/api/portfolio/cards/hydrated",
    createHydratedPortfolioHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => [],
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
  });
});
