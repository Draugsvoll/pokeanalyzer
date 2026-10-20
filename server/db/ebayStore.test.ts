import assert from "node:assert/strict";
import test from "node:test";
import {
  getCardEbayContext,
  getStoredEbayResponse,
  isCompleteEbayResponse,
  saveCardEbayResponse,
} from "./ebayStore.js";
import { saveCardGrokResponse } from "./cardGrokStore.js";
import { ensurePokeTraceReady, pokeTraceDb } from "./pokeTraceDb.js";

const now = Date.parse("2026-10-20T12:00:00.000Z");
const query = "Nidoking (011/130,11/130,11) Base Set 2";
const response = {
  active: { items: [] },
  sold: { items: [] },
  request_query: query,
  timestamp: new Date(now - 1000).toISOString(),
};

test("eBay cache accepts empty results and rejects partial or malformed results", () => {
  assert.equal(isCompleteEbayResponse(response), true);
  for (const invalid of [
    null,
    { ...response, active: null },
    { ...response, sold: {} },
    { ...response, active: { items: "invalid" } },
  ]) {
    assert.equal(isCompleteEbayResponse(invalid), false);
  }
});

test("eBay cache enforces two days, matching query and valid timestamp", () => {
  const expiryBoundary = now - 2 * 86_400_000;
  const justBeforeExpiry = {
    ...response,
    timestamp: new Date(expiryBoundary + 1).toISOString(),
  };
  assert.deepEqual(
    getStoredEbayResponse({ ebay: response }, query, now),
    response,
  );
  assert.deepEqual(
    getStoredEbayResponse({ ebay: justBeforeExpiry }, query, now),
    justBeforeExpiry,
  );
  for (const candidate of [
    { ...response, timestamp: new Date(expiryBoundary).toISOString() },
    { ...response, timestamp: new Date(expiryBoundary - 1).toISOString() },
    { ...response, timestamp: new Date(now + 1).toISOString() },
    { ...response, timestamp: "invalid" },
    { ...response, request_query: "different query" },
    { ...response, active: null },
  ]) {
    assert.equal(getStoredEbayResponse({ ebay: candidate }, query, now), null);
  }
});

test("eBay cache reads legacy results only when valid and prefers the new storage", () => {
  const legacy = { ...response, marker: "legacy" };
  const current = { ...response, marker: "current" };
  assert.deepEqual(
    getStoredEbayResponse({ grok: { ebay_sold: legacy } }, query, now),
    legacy,
  );
  assert.deepEqual(
    getStoredEbayResponse(
      { ebay: current, grok: { ebay_sold: legacy } },
      query,
      now,
    ),
    current,
  );
  assert.deepEqual(
    getStoredEbayResponse(
      {
        ebay: { ...current, request_query: "different query" },
        grok: { ebay_sold: legacy },
      },
      query,
      now,
    ),
    legacy,
  );
  assert.equal(
    getStoredEbayResponse(
      { grok: { ebay_sold: { ...legacy, request_query: "other" } } },
      query,
      now,
    ),
    null,
  );
});

test("concurrent eBay and AI saves preserve their own paths and other saved data", async () => {
  await ensurePokeTraceReady();
  const cardId = "independent-ebay-storage";
  const legacy = { ...response, marker: "legacy" };
  await pokeTraceDb.execute({
    sql: "INSERT INTO poketrace_cards (id, name, raw_json, saved_responses) VALUES (?, ?, ?, ?)",
    args: [
      cardId,
      "Nidoking",
      JSON.stringify({
        name: " Nidoking ",
        cardNumber: "011/130",
        set: { name: "Base Set 2" },
      }),
      JSON.stringify({
        grok: { ebay_sold: legacy },
        unrelated: { keep: true },
      }),
    ],
  });
  const marketResponse = {
    score: 63,
    headline: "Prices and sales activity are broadly stable.",
    market_signals: {
      demand: { score: 61, explanation: "Recent sales show steady interest." },
    },
  };
  const [savedEbay, savedAi] = await Promise.all([
    saveCardEbayResponse(cardId, response),
    saveCardGrokResponse(cardId, "market_analysis", marketResponse),
  ]);
  assert.ok(savedEbay);
  assert.ok(savedAi);
  const result = await pokeTraceDb.execute({
    sql: "SELECT saved_responses FROM poketrace_cards WHERE id = ?",
    args: [cardId],
  });
  const stored = JSON.parse(String(result.rows[0].saved_responses));
  assert.deepEqual(stored.ebay, savedEbay);
  assert.deepEqual(stored.grok.market_analysis, savedAi);
  assert.deepEqual(stored.grok.ebay_sold, legacy);
  assert.deepEqual(stored.unrelated, { keep: true });
  const context = await getCardEbayContext(cardId);
  assert.equal(context?.cardName, "Nidoking");
  assert.equal(context?.cardNumber, "011/130");
});

test("invalid eBay results are not saved", async () => {
  assert.equal(await saveCardEbayResponse("missing", { sold: null }), null);
  assert.equal(
    await saveCardEbayResponse("missing", {
      active: { items: [] },
      sold: { items: [] },
    }),
    null,
  );
});
