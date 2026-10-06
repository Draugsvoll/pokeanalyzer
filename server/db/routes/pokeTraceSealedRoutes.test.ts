import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { requestFromTestServer } from "./httpTestServer.js";
import {
  createPokeTraceSealedCatalogRefreshHandler,
  createSealedMarketPriceHistoryHandler,
} from "./pokeTraceSealedRoutes.js";

const productId = "019bff85-5452-714a-9660-a3559a2d5d95";

test("sealed catalog force refresh requires the configured token", async () => {
  const app = express();
  let refreshes = 0;
  app.post(
    "/api/sealed/catalog/refresh",
    createPokeTraceSealedCatalogRefreshHandler({
      refreshCatalog: async () => {
        refreshes += 1;
        return {
          schemaVersion: 1,
          generatedAt: "2026-10-06T00:00:00.000Z",
          products: [],
        };
      },
      refreshToken: "catalog-refresh-secret",
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/sealed/catalog/refresh",
    { method: "POST" },
  );

  assert.equal(response.status, 401);
  assert.equal(refreshes, 0);
});

test("sealed catalog force refresh accepts the configured token", async () => {
  const app = express();
  let refreshes = 0;
  app.post(
    "/api/sealed/catalog/refresh",
    createPokeTraceSealedCatalogRefreshHandler({
      refreshCatalog: async () => {
        refreshes += 1;
        return {
          schemaVersion: 1,
          generatedAt: "2026-10-06T00:00:00.000Z",
          products: [],
        };
      },
      refreshToken: "catalog-refresh-secret",
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/sealed/catalog/refresh",
    {
      method: "POST",
      headers: { Authorization: "Bearer catalog-refresh-secret" },
    },
  );

  assert.equal(response.status, 204);
  assert.equal(refreshes, 1);
});

test("sealed market history route returns live unopened API history", async () => {
  const app = express();
  app.get(
    "/api/sealed/:id/market-price-history",
    createSealedMarketPriceHistoryHandler({
      loadHistory: async (requestedId) => ({
        productId: requestedId,
        condition: "UNOPENED",
        period: "90d",
        currency: "USD",
        fetchedAt: "2026-10-05T12:00:00.000Z",
        stale: false,
        series: {
          tcgplayer: [
            {
              date: "2026-10-05",
              avg: 150,
              median7d: null,
              median30d: null,
              low: 145,
              high: 160,
              saleCount: 8,
              approxSaleCount: false,
            },
          ],
        },
      }),
    }),
  );

  const response = await requestFromTestServer(
    app,
    `/api/sealed/${productId}/market-price-history`,
  );

  assert.equal(response.status, 200);
  const history = (await response.json()) as {
    condition: string;
    productId: string;
    series: { tcgplayer: unknown[] };
  };
  assert.equal(history.productId, productId);
  assert.equal(history.condition, "UNOPENED");
  assert.equal(history.series.tcgplayer.length, 1);
});

test("sealed market history route rejects invalid product IDs", async () => {
  const app = express();
  let calls = 0;
  app.get(
    "/api/sealed/:id/market-price-history",
    createSealedMarketPriceHistoryHandler({
      loadHistory: async () => {
        calls += 1;
        throw new Error("should not run");
      },
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/sealed/not-a-product/market-price-history",
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("sealed market history route returns 404 for an unknown product", async () => {
  const app = express();
  app.get(
    "/api/sealed/:id/market-price-history",
    createSealedMarketPriceHistoryHandler({
      loadHistory: async () => null,
    }),
  );

  const response = await requestFromTestServer(
    app,
    `/api/sealed/${productId}/market-price-history`,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Sealed product not found",
  });
});
