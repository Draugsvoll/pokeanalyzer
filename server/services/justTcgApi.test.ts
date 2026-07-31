import assert from "node:assert/strict";
import test from "node:test";
import { fetchJustTcgCard } from "./justTcgApi.js";

test("JustTCG card requests include 180-day price history", async () => {
  const originalApiKey = process.env.JUSTTCG_API_KEY;
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  process.env.JUSTTCG_API_KEY = "test-key";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ data: [] }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    await fetchJustTcgCard("Blaine's Charizard", "2");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.JUSTTCG_API_KEY;
    } else {
      process.env.JUSTTCG_API_KEY = originalApiKey;
    }
  }

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("include_price_history"), "true");
  assert.equal(url.searchParams.get("priceHistoryDuration"), "180d");
  assert.equal(url.searchParams.get("include_statistics"), "allTime");
});
