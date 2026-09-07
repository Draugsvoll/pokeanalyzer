import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { getMostExpensiveNewReleases } from "./cardDiscovery.js";

function releaseDate(monthOffset: number) {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 15),
  );
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}/${month}/15`;
}

function card(
  id: string,
  prices: Record<string, { market: number }>,
  monthOffset = -1,
) {
  return JSON.stringify({
    grok: { worth_grading: { response: "private" } },
    id,
    images: { large: "large.png", small: "small.png" },
    name: `Card ${id}`,
    number: id,
    set: {
      id: "test-set",
      name: "Test Set",
      releaseDate: releaseDate(monthOffset),
      series: "Current",
    },
    tcgplayer: { prices },
  });
}

test("most expensive new releases execute the production query correctly", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    await client.execute(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        raw_json TEXT NOT NULL
      )
    `);

    const rows = [
      card("holo-only", { holofoil: { market: 400 } }),
      card("normal-first", {
        normal: { market: 300 },
        holofoil: { market: 900 },
      }),
      card("normal-only", { normal: { market: 200 } }),
      card("old", { normal: { market: 1_000 } }, -13),
      card("future", { normal: { market: 1_100 } }, 1),
      card("zero-price", { normal: { market: 0 } }),
    ];

    await client.batch(
      rows.map((rawJson, index) => ({
        args: [`card-${index}`, rawJson],
        sql: "INSERT INTO cards (id, raw_json) VALUES (?, json(?))",
      })),
      "write",
    );

    const cards = await getMostExpensiveNewReleases(
      2,
      async (sql, args = []) => {
        const result = await client.execute({ sql, args });
        return result.rows.map((row) => ({
          raw_json: String(row.raw_json),
        }));
      },
    );

    assert.deepEqual(
      cards.map((result) => result.id),
      ["holo-only", "normal-first"],
    );
    assert.equal("grok" in cards[0], false);
    assert.equal("grok" in cards[1], false);
  } finally {
    client.close();
  }
});
