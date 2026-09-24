import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createMarketCategoriesHandler } from "./marketCategoryRoutes.js";
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
