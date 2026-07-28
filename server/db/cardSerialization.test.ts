import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePublicStoredCard,
  parseStoredCard,
} from "./cardSerialization.js";

test("parsePublicStoredCard removes application-owned Grok data", () => {
  const rawJson = JSON.stringify({
    id: "base1-1",
    name: "Alakazam",
    grok: {
      price_analysis: {
        timestamp: "2026-07-26T00:00:00.000Z",
        summary: "stored analysis",
      },
    },
  });

  assert.deepEqual(parsePublicStoredCard(rawJson), {
    id: "base1-1",
    name: "Alakazam",
  });
  assert.equal("grok" in parseStoredCard(rawJson), true);
});

test("stored card JSON must contain an object", () => {
  assert.throws(
    () => parseStoredCard(JSON.stringify(["not", "a", "card"])),
    /must be an object/,
  );
});
