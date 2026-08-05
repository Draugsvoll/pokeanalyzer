import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  parsePortfolioPriceSnapshot,
  PORTFOLIO_COMPARISON_SNAPSHOTS_SQL,
  type PortfolioPriceSnapshotRow,
} from "./portfolioPriceSnapshots.js";

test("portfolio history selects comparison snapshots for each timeframe", async () => {
  const client = createClient({ url: ":memory:" });

  try {
    await client.execute(`
      CREATE TABLE price_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        tcgplayer_prices TEXT,
        cardmarket_prices TEXT,
        tcgplayer_updated_at TEXT,
        cardmarket_updated_at TEXT,
        UNIQUE(card_id, recorded_at)
      )
    `);

    await client.batch(
      [
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices, tcgplayer_updated_at)
            VALUES (?, ?, json(?), ?)`,
          args: [
            "card-a",
            "2026-06-27",
            JSON.stringify({ holofoil: { market: 6 } }),
            "2026/06/27",
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices, tcgplayer_updated_at)
            VALUES (?, ?, json(?), ?)`,
          args: [
            "card-a",
            "2026-07-20",
            JSON.stringify({ holofoil: { market: 8 } }),
            "2026/07/20",
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices, tcgplayer_updated_at)
            VALUES (?, ?, json(?), ?)`,
          args: [
            "card-a",
            "2026-07-26",
            JSON.stringify({ holofoil: { market: 10 } }),
            "2026/07/26",
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices, tcgplayer_updated_at)
            VALUES (?, ?, json(?), ?)`,
          args: [
            "card-a",
            "2026-07-27",
            JSON.stringify({ holofoil: { market: 12 } }),
            "2026/07/27",
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices, tcgplayer_updated_at)
            VALUES (?, ?, json(?), ?)`,
          args: [
            "card-a",
            "2026-07-28",
            JSON.stringify({ holofoil: { market: 15 } }),
            "2026/07/28",
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, cardmarket_prices, cardmarket_updated_at)
            VALUES (?, ?, json(?), ?)`,
          args: [
            "card-b",
            "2026-07-28",
            JSON.stringify({ trendPrice: 20 }),
            "2026/07/28",
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices)
            VALUES (?, ?, json(?))`,
          args: [
            "card-c",
            "2026-06-26",
            JSON.stringify({ holofoil: { market: 4 } }),
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices)
            VALUES (?, ?, json(?))`,
          args: [
            "card-c",
            "2026-06-30",
            JSON.stringify({ holofoil: { market: 5 } }),
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices)
            VALUES (?, ?, json(?))`,
          args: [
            "card-c",
            "2026-07-19",
            JSON.stringify({ holofoil: { market: 7 } }),
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices)
            VALUES (?, ?, json(?))`,
          args: [
            "card-c",
            "2026-07-23",
            JSON.stringify({ holofoil: { market: 8 } }),
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices)
            VALUES (?, ?, json(?))`,
          args: [
            "card-c",
            "2026-07-28",
            JSON.stringify({ holofoil: { market: 10 } }),
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices)
            VALUES (?, ?, json(?))`,
          args: [
            "card-d",
            "2026-07-26",
            JSON.stringify({ holofoil: { market: 18 } }),
          ],
        },
        {
          sql: `INSERT INTO price_snapshots
            (card_id, recorded_at, tcgplayer_prices)
            VALUES (?, ?, json(?))`,
          args: [
            "card-d",
            "2026-07-28",
            JSON.stringify({ holofoil: { market: 20 } }),
          ],
        },
      ],
      "write",
    );

    const result = await client.execute({
      sql: PORTFOLIO_COMPARISON_SNAPSHOTS_SQL,
      args: [JSON.stringify(["card-a", "card-b", "card-c", "card-d"])],
    });

    assert.equal(result.rows.length, 8);
    const cardALatest = result.rows.find(
      (row) => row.card_id === "card-a" && row.comparison_period === "latest",
    );
    const cardAPrevious = result.rows.find(
      (row) => row.card_id === "card-a" && row.comparison_period === "24h",
    );
    const cardASevenDays = result.rows.find(
      (row) => row.card_id === "card-a" && row.comparison_period === "7d",
    );
    const cardAThirtyDays = result.rows.find(
      (row) => row.card_id === "card-a" && row.comparison_period === "30d",
    );
    const cardBLatest = result.rows.find(
      (row) => row.card_id === "card-b" && row.comparison_period === "latest",
    );
    const cardDPrevious = result.rows.find(
      (row) => row.card_id === "card-d" && row.comparison_period === "24h",
    );
    assert.equal(cardALatest?.recorded_at, "2026-07-28");
    assert.equal(cardAPrevious?.recorded_at, "2026-07-27");
    assert.equal(cardASevenDays?.recorded_at, "2026-07-20");
    assert.equal(cardAThirtyDays?.recorded_at, "2026-06-27");
    assert.equal(cardBLatest?.recorded_at, "2026-07-28");
    assert.equal(cardDPrevious?.recorded_at, "2026-07-26");
    assert.equal(
      result.rows.some(
        (row) => row.card_id === "card-b" && row.comparison_period !== "latest",
      ),
      false,
      "cards without enough history must not receive comparison snapshots",
    );
    assert.deepEqual(
      result.rows
        .filter((row) => row.card_id === "card-c")
        .map((row) => row.comparison_period)
        .sort(),
      ["latest"],
      "5/9-day and 28/32-day snapshots must not qualify for 24h/7d/30d",
    );

    const snapshot = parsePortfolioPriceSnapshot(
      cardAPrevious as unknown as PortfolioPriceSnapshotRow,
    );
    assert.deepEqual(snapshot.tcgplayerPrices, {
      holofoil: { market: 12 },
    });
    assert.equal(snapshot.tcgplayerUpdatedAt, "2026/07/27");
  } finally {
    client.close();
  }
});

test("invalid stored portfolio snapshot JSON is rejected", () => {
  assert.throws(
    () =>
      parsePortfolioPriceSnapshot({
        card_id: "card-a",
        recorded_at: "2026-07-27",
        tcgplayer_prices: "{invalid",
        cardmarket_prices: null,
        tcgplayer_updated_at: null,
        cardmarket_updated_at: null,
        comparison_period: "24h",
      }),
    /invalid tcgplayer JSON/,
  );
});
