import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  NEWS_CONTENT_UPSERT_SQL,
  NEWS_FEEDS,
  parseStoredNewsRows,
} from "./newsStore.js";

const generalNews = {
  date: "2026-07-28",
  items: [
    {
      headline: "Market update",
      label: "market",
      summary: "A concise summary.",
      action: [],
      url: "https://example.com/news/story",
    },
  ],
};

test("news schema keeps one valid JSON row per feed", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    const schema = await readFile(
      new URL("./schema.sql", import.meta.url),
      "utf8",
    );
    for (const statement of schema
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await client.execute(statement);
    }

    await client.execute({
      sql: NEWS_CONTENT_UPSERT_SQL,
      args: [
        NEWS_FEEDS.generalNews,
        JSON.stringify(generalNews),
        generalNews.date,
      ],
    });
    await client.execute({
      sql: NEWS_CONTENT_UPSERT_SQL,
      args: [
        NEWS_FEEDS.generalNews,
        JSON.stringify({ ...generalNews, date: "2026-07-29" }),
        "2026-07-29",
      ],
    });

    const result = await client.execute(
      "SELECT feed, payload_json, source_date FROM news_content",
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].feed, NEWS_FEEDS.generalNews);
    assert.equal(result.rows[0].source_date, "2026-07-29");
    assert.equal(
      JSON.parse(String(result.rows[0].payload_json)).date,
      "2026-07-29",
    );

    await assert.rejects(
      client.execute({
        sql: NEWS_CONTENT_UPSERT_SQL,
        args: ["unknown_feed", "{}", null],
      }),
    );
  } finally {
    client.close();
  }
});

test("stored news rows are validated and missing feeds stay null", () => {
  assert.deepEqual(
    parseStoredNewsRows([
      {
        feed: NEWS_FEEDS.generalNews,
        payload_json: JSON.stringify(generalNews),
      },
    ]),
    {
      generalNews,
    },
  );

  assert.deepEqual(parseStoredNewsRows([]), {
    generalNews: null,
  });
});

test("malformed, unknown, and duplicate stored feeds are rejected", () => {
  assert.throws(
    () =>
      parseStoredNewsRows([
        {
          feed: "unknown_feed",
          payload_json: JSON.stringify(generalNews),
        },
      ]),
    /Unknown stored news feed/,
  );

  assert.throws(
    () =>
      parseStoredNewsRows([
        {
          feed: NEWS_FEEDS.generalNews,
          payload_json: JSON.stringify(generalNews),
        },
        {
          feed: NEWS_FEEDS.generalNews,
          payload_json: JSON.stringify(generalNews),
        },
      ]),
    /Duplicate stored news feed/,
  );
});
