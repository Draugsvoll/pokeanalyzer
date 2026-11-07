import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createMarketCategoriesHandler,
  createGradingOpportunityListHandler,
} from "./marketCategoryRoutes.js";
import { requestFromTestServer } from "./httpTestServer.js";

const payload = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-24T12:00:00.000Z",
  categories: [],
};

test("GET market categories returns the stored payload", async () => {
  const app = express();
  app.get(
    "/api/market-categories",
    createMarketCategoriesHandler({ loadCategories: async () => payload }),
  );

  const response = await requestFromTestServer(app, "/api/market-categories");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), payload);
});

test("GET market categories reports when the cron has not stored data", async () => {
  const app = express();
  app.get(
    "/api/market-categories",
    createMarketCategoriesHandler({ loadCategories: async () => null }),
  );

  const response = await requestFromTestServer(app, "/api/market-categories");

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Market categories are not available",
  });
});

test("grading list endpoint serves a snapshot or null and reports temporary errors", async () => {
  const app = express();
  const list = {
    schemaVersion: 2 as const,
    generatedAt: new Date().toISOString(),
    items: [{ cardId: "one", psa10Price: 600 }],
  };
  app.get(
    "/list",
    createGradingOpportunityListHandler(async () => list),
  );
  app.get(
    "/missing",
    createGradingOpportunityListHandler(async () => null),
  );
  app.get(
    "/failure",
    createGradingOpportunityListHandler(
      async () => {
        throw new Error("offline");
      },
      () => {},
    ),
  );
  const response = await requestFromTestServer(app, "/list");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), list);
  assert.equal(
    await (await requestFromTestServer(app, "/missing")).json(),
    null,
  );
  assert.equal((await requestFromTestServer(app, "/failure")).status, 503);
});
