import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  JUST_TCG_CATEGORIES,
  JUST_TCG_CATEGORY_UPSERT_SQL,
} from "./justTcgCategoryStore.js";

const payload = {
  cards: [
    {
      card: {
        id: "base1-4",
        images: { large: "", small: "" },
        name: "Charizard",
        set: { id: "base1", name: "Base Set", series: "Base" },
      },
      mover: {
        cardName: "Charizard",
        changePercent: 25,
        condition: "Near Mint",
        currentPrice: 300,
        period: "7d",
        printing: "Holofoil",
        setName: "Base Set",
      },
    },
  ],
};

test("JustTCG category schema keeps one row per category and period", async () => {
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
      sql: JUST_TCG_CATEGORY_UPSERT_SQL,
      args: [JUST_TCG_CATEGORIES.biggestMovers, "7d", JSON.stringify(payload)],
    });
    await client.execute({
      sql: JUST_TCG_CATEGORY_UPSERT_SQL,
      args: [
        JUST_TCG_CATEGORIES.biggestMovers,
        "7d",
        JSON.stringify({ cards: [] }),
      ],
    });

    const result = await client.execute(
      "SELECT category_key, period, payload_json FROM justtcg_categories",
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].category_key, JUST_TCG_CATEGORIES.biggestMovers);
    assert.equal(result.rows[0].period, "7d");
    assert.deepEqual(JSON.parse(String(result.rows[0].payload_json)), {
      cards: [],
    });

    await client.execute({
      sql: JUST_TCG_CATEGORY_UPSERT_SQL,
      args: ["trending_cards", "7d", JSON.stringify(payload)],
    });
    await assert.rejects(
      client.execute({
        sql: JUST_TCG_CATEGORY_UPSERT_SQL,
        args: [JUST_TCG_CATEGORIES.biggestMovers, "14d", JSON.stringify(payload)],
      }),
    );
    await assert.rejects(
      client.execute({
        sql: JUST_TCG_CATEGORY_UPSERT_SQL,
        args: [JUST_TCG_CATEGORIES.biggestMovers, "7d", "not json"],
      }),
    );
  } finally {
    client.close();
  }
});
