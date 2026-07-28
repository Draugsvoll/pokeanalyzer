import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBiggestMoversResponse,
  parseGeneralNewsResponse,
} from "./newsGeneration.js";

test("validates the latest-news shape produced by the admin prompt", () => {
  const result = parseGeneralNewsResponse(`{
    "date": "2026-07-28",
    "items": [{
      "headline": "A headline",
      "label": "market",
      "summary": "A concise summary.",
      "action": ["Watch the market"],
      "url": "https://example.com/news/story"
    }]
  }`);

  assert.equal(result.date, "2026-07-28");
  assert.equal(result.items[0].headline, "A headline");
});

test("accepts the admin movers shape and normalizes ranks to strings", () => {
  const result = parseBiggestMoversResponse(`\`\`\`json
  {
    "date": "2026-07-08",
    "report_link": "https://www.tcgplayer.com/content/article/example/abc/",
    "cards": [{
      "rank": 1,
      "card_name": "Salamence",
      "summary": "The card moved substantially."
    }]
  }
  \`\`\``);

  assert.deepEqual(result, {
    report_link: "https://www.tcgplayer.com/content/article/example/abc/",
    cards: [
      {
        rank: "1",
        card_name: "Salamence",
        summary: "The card moved substantially.",
      },
    ],
  });
});

test("rejects malformed payloads instead of overwriting news files", () => {
  assert.throws(
    () => parseBiggestMoversResponse('{"report_link":"","cards":[]}'),
    /at least one card/,
  );
  assert.throws(
    () => parseGeneralNewsResponse('{"date":"2026-07-28","items":[]}'),
    /at least one item/,
  );
});
