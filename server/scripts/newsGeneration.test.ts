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

test("allows latest-news items without a direct URL", () => {
  const result = parseGeneralNewsResponse(`{
    "date": "2026-07-28",
    "items": [
      {
        "headline": "A headline",
        "label": "market",
        "summary": "A concise summary.",
        "action": [],
        "url": ""
      },
      {
        "headline": "Another headline",
        "label": "grading",
        "summary": "Another concise summary.",
        "action": [],
        "url": null
      }
    ]
  }`);

  assert.equal(result.items[0].url, "");
  assert.equal(result.items[1].url, "");
});

test("rejects malformed non-empty latest-news URLs", () => {
  assert.throws(
    () =>
      parseGeneralNewsResponse(`{
      "date": "2026-07-28",
      "items": [{
        "headline": "A headline",
        "label": "market",
        "summary": "A concise summary.",
        "action": [],
        "url": "not-a-url"
      }]
    }`),
    /valid HTTP URL/,
  );
});

test("accepts the admin movers shape and assigns ranks by card order", () => {
  const result = parseBiggestMoversResponse(`{
    "date": "2026-07-08",
    "report_link": "https://www.tcgplayer.com/content/article/example/abc/",
    "cards": [
      {
        "card_name": "Salamence",
        "summary": "The card moved substantially."
      },
      {
        "card_name": "Pikachu",
        "summary": "The card also moved."
      }
    ]
  }`);

  assert.deepEqual(result, {
    report_link: "https://www.tcgplayer.com/content/article/example/abc/",
    cards: [
      {
        rank: "1",
        card_name: "Salamence",
        summary: "The card moved substantially.",
      },
      {
        rank: "2",
        card_name: "Pikachu",
        summary: "The card also moved.",
      },
    ],
  });
});

test("rejects JSON wrapped in markdown or additional text", () => {
  const payload = `{
    "date": "2026-07-28",
    "items": [{
      "headline": "A headline",
      "label": "market",
      "summary": "A concise summary.",
      "action": [],
      "url": ""
    }]
  }`;

  assert.throws(
    () => parseGeneralNewsResponse(`\`\`\`json\n${payload}\n\`\`\``),
    /invalid JSON/,
  );
  assert.throws(
    () => parseGeneralNewsResponse(`News response:\n${payload}`),
    /invalid JSON/,
  );
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
