import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createCardDetailsHandler,
  loadCardDetails,
} from "./cardDetailsRoutes.js";
import { requestFromTestServer } from "./httpTestServer.js";

function vintageCardRow(tcgMarket = 50, cardmarketTrend = 100) {
  return {
    raw_json: JSON.stringify({
      id: "gym2-2",
      name: "Blaine's Charizard",
      tcgplayer: {
        prices: {
          "1stEditionHolofoil": {
            low: 1,
            mid: 10,
            high: 500,
            market: 100,
          },
          unlimitedHolofoil: {
            low: tcgMarket - 5,
            mid: tcgMarket,
            high: tcgMarket + 10,
            market: tcgMarket,
          },
        },
      },
      cardmarket: {
        prices: {
          trendPrice: cardmarketTrend,
          averageSellPrice: 10,
          avg7: 10,
          avg30: 10,
          lowPrice: 1,
        },
      },
    }),
    previous_cardmarket_prices: JSON.stringify({ trendPrice: cardmarketTrend }),
    previous_recorded_at: "2026-07-29T00:00:00.000Z",
  };
}

test("GET /api/cards/:id attaches reliability using real vintage variant keys", async () => {
  const app = express();
  app.get(
    "/api/cards/:id",
    createCardDetailsHandler({
      loadDetails: (cardId) =>
        loadCardDetails(cardId, async (sql, params) => {
          assert.match(sql, /LIMIT 1 OFFSET 1/);
          assert.deepEqual(params, [cardId, cardId]);
          return vintageCardRow();
        }),
      reportError: () => {
        assert.fail("The successful request must not be logged as an error");
      },
    }),
  );

  const response = await requestFromTestServer(app, "/api/cards/gym2-2");
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.id, "gym2-2");
  assert.deepEqual(body.priceReliability, {
    tcgplayer: { isFlagged: false },
    cardmarket: { isFlagged: true },
  });
});

test("GET /api/cards/:id applies the $25 floor to both default prices", async () => {
  const app = express();
  app.get(
    "/api/cards/:id",
    createCardDetailsHandler({
      loadDetails: (cardId) =>
        loadCardDetails(cardId, async () => vintageCardRow(24.99, 24.99)),
      reportError: () => {
        assert.fail("The successful request must not be logged as an error");
      },
    }),
  );

  const response = await requestFromTestServer(app, "/api/cards/gym2-2");
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.deepEqual(body.priceReliability, {
    tcgplayer: { isFlagged: false },
    cardmarket: { isFlagged: false },
  });
});

test("GET /api/cards/:id returns 404 when the card does not exist", async () => {
  const app = express();
  app.get(
    "/api/cards/:id",
    createCardDetailsHandler({
      loadDetails: async () => null,
      reportError: () => {
        assert.fail("A missing card must not be logged as a server error");
      },
    }),
  );

  const response = await requestFromTestServer(app, "/api/cards/missing");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Card not found" });
});

test("GET /api/cards/:id keeps internal failures out of the response", async () => {
  const app = express();
  let loggedContext = "";
  app.get(
    "/api/cards/:id",
    createCardDetailsHandler({
      loadDetails: async () => {
        throw new Error("database credentials leaked here");
      },
      reportError: (context) => {
        loggedContext = context;
      },
    }),
  );

  const response = await requestFromTestServer(app, "/api/cards/gym2-2");

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Failed to fetch card" });
  assert.equal(loggedContext, "Failed to fetch card");
});
