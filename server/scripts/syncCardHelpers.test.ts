import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard.js";
import {
  APPLY_CARDMARKET_PRICE_UPDATES_SQL,
  APPLY_DAILY_SNAPSHOTS_SQL,
  APPLY_METADATA_UPDATES_SQL,
  APPLY_TCGPLAYER_PRICE_UPDATES_SQL,
  buildAcquireSyncLock,
  buildReleaseSyncLock,
  buildSafeFullCard,
  buildStageCardStatement,
  CARD_APPLY_MISMATCH_COUNT_SQL,
  CARD_SYNC_STAGE_TABLE_SQL,
  getProviderPriceStates,
  INSERT_NEW_CARDS_SQL,
  isJsonObject,
  metadataSignature,
  PRICE_ONLY_APPLY_EXPECTATIONS_SQL,
  PRICE_HISTORY_CLEANUP_SQL,
  providerPriceChanged,
  sanitizeIncomingCard,
  SNAPSHOT_APPLY_MISMATCH_COUNT_SQL,
} from "./syncCardHelpers.js";
import {
  SCHEDULED_MAINTENANCE_LOCK_NAME,
  SCRIPT_LOCK_TABLE_SQL,
} from "./scriptLocks.js";

function completeCard(
  overrides: Record<string, unknown> = {},
): PokemonTcgApiCard {
  return {
    id: "base1-1",
    images: {
      large: "https://example.test/large.png",
      small: "https://example.test/small.png",
    },
    name: "Alakazam",
    number: "1",
    set: { id: "base1", name: "Base" },
    supertype: "Pokémon",
    ...overrides,
  } as PokemonTcgApiCard;
}

async function createSyncDatabase() {
  const client = createClient({ url: "file::memory:" });
  await client.batch(
    [
      `CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        number TEXT,
        name TEXT NOT NULL,
        set_id TEXT,
        set_name TEXT,
        image_small TEXT,
        image_large TEXT,
        raw_json TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE price_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        recorded_at DATE NOT NULL,
        tcgplayer_prices TEXT,
        cardmarket_prices TEXT,
        tcgplayer_updated_at TEXT,
        cardmarket_updated_at TEXT,
        UNIQUE(card_id, recorded_at)
      )`,
      CARD_SYNC_STAGE_TABLE_SQL,
    ],
    "write",
  );
  return client;
}

test("incomplete upstream cards are rejected", () => {
  assert.throws(
    () =>
      sanitizeIncomingCard({
        id: "base1-1",
        name: "Alakazam",
      }),
    /incomplete metadata/,
  );
  assert.doesNotThrow(() => sanitizeIncomingCard(completeCard()));
});

test("metadata comparison ignores prices, provider dates, and Grok", () => {
  const first = completeCard({
    grok: { private: true },
    tcgplayer: {
      prices: { holofoil: { market: 10 } },
      updatedAt: "2026/07/26",
      url: "same",
    },
  });
  const priceChange = completeCard({
    tcgplayer: {
      prices: { holofoil: { market: 12 } },
      updatedAt: "2026/07/27",
      url: "same",
    },
  });
  const metadataChange = completeCard({
    tcgplayer: {
      prices: { holofoil: { market: 12 } },
      updatedAt: "2026/07/27",
      url: "changed",
    },
  });

  assert.equal(metadataSignature(first), metadataSignature(priceChange));
  assert.notEqual(metadataSignature(first), metadataSignature(metadataChange));
});

test("safe full cards use upstream data but protect missing current prices", () => {
  const existing = completeCard({
    grok: { private: true },
    name: "Old name",
    tcgplayer: {
      prices: { holofoil: { market: 10 } },
      updatedAt: "2026/07/26",
      url: "old-url",
    },
  }) as Record<string, unknown>;
  const incoming = completeCard({
    name: "Corrected name",
    tcgplayer: { url: "new-url" },
  });

  const safe = buildSafeFullCard(incoming, existing);
  assert.equal(safe.name, "Corrected name");
  assert.deepEqual(safe.tcgplayer, {
    prices: { holofoil: { market: 10 } },
    updatedAt: "2026/07/26",
    url: "new-url",
  });
  assert.equal("grok" in safe, false);
});

test("only valid incoming prices can count as a current price change", () => {
  const existing = getProviderPriceStates(
    completeCard({
      tcgplayer: {
        prices: { holofoil: { market: 10 } },
        updatedAt: "old",
      },
    }) as Record<string, unknown>,
  );
  const changed = getProviderPriceStates(
    completeCard({
      tcgplayer: {
        prices: { holofoil: { market: 12 } },
        updatedAt: "new",
      },
    }) as Record<string, unknown>,
  );
  const missing = getProviderPriceStates(
    completeCard({
      tcgplayer: { prices: { holofoil: { market: 0 } } },
    }) as Record<string, unknown>,
  );

  assert.equal(
    providerPriceChanged(changed.tcgplayer, existing.tcgplayer),
    true,
  );
  assert.equal(
    providerPriceChanged(missing.tcgplayer, existing.tcgplayer),
    false,
  );
});

test("one atomic apply updates metadata/prices, preserves Grok, and upserts one daily snapshot", async () => {
  const client = await createSyncDatabase();
  try {
    const existing = completeCard({
      grok: { analysis: { keep: true } },
      justtcg: {
        prices: {
          "pokemon-base-set-alakazam-holo-rare:holofoil-near-mint": {
            market: 120,
            percentChange24h: null,
          },
        },
        metadata: {
          sourceUrl: null,
        },
        updatedAt: "2026-08-12T00:00:00.000Z",
      },
      justtcgLookup: { ids: ["pokemon-base-set-alakazam-holo-rare"] },
      name: "Old name",
      tcgplayer: {
        prices: { holofoil: { market: 10 } },
        updatedAt: "2026/07/26",
      },
    });
    await client.execute({
      sql: `INSERT INTO cards
        (id, number, name, set_id, set_name, image_small, image_large, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, json(?))`,
      args: [
        existing.id,
        existing.number ?? null,
        existing.name,
        existing.set?.id ?? null,
        existing.set?.name ?? null,
        existing.images?.small ?? null,
        existing.images?.large ?? null,
        JSON.stringify(existing),
      ],
    });

    const incoming = completeCard({
      name: "Corrected name",
      tcgplayer: {
        prices: { holofoil: { market: 12 } },
        updatedAt: "2026/07/27",
      },
    });
    const states = getProviderPriceStates(incoming as Record<string, unknown>);
    await client.execute(
      buildStageCardStatement(
        "run-one",
        buildSafeFullCard(incoming, existing as Record<string, unknown>),
        states,
        {
          cardmarketChanged: false,
          isNew: false,
          metadataChanged: true,
          tcgplayerChanged: true,
        },
      ),
    );

    const apply = [
      { sql: APPLY_METADATA_UPDATES_SQL, args: ["run-one"] },
      { sql: APPLY_TCGPLAYER_PRICE_UPDATES_SQL, args: ["run-one"] },
      { sql: APPLY_CARDMARKET_PRICE_UPDATES_SQL, args: ["run-one"] },
      { sql: INSERT_NEW_CARDS_SQL, args: ["run-one"] },
      {
        sql: APPLY_DAILY_SNAPSHOTS_SQL,
        args: ["2026-07-27", "run-one"],
      },
      {
        sql: PRICE_HISTORY_CLEANUP_SQL,
        args: ["2026-07-27"],
      },
    ];
    await client.batch(apply, "write");
    await client.batch(apply, "write");

    const cardRow = (
      await client.execute(
        "SELECT name, raw_json FROM cards WHERE id = 'base1-1'",
      )
    ).rows[0];
    const raw: unknown = JSON.parse(String(cardRow.raw_json));
    assert.ok(isJsonObject(raw));
    assert.equal(cardRow.name, "Corrected name");
    assert.deepEqual(raw.grok, existing.grok);
    assert.deepEqual(raw.justtcg, existing.justtcg);
    assert.deepEqual(raw.justtcgLookup, existing.justtcgLookup);
    assert.equal(
      (
        (raw.tcgplayer as Record<string, unknown>).prices as Record<
          string,
          Record<string, number>
        >
      ).holofoil.market,
      12,
    );

    const snapshots = await client.execute(
      "SELECT * FROM price_snapshots WHERE card_id = 'base1-1'",
    );
    assert.equal(snapshots.rows.length, 1);
    assert.equal(snapshots.rows[0].cardmarket_prices, null);

    const matchingCard = await client.execute({
      sql: CARD_APPLY_MISMATCH_COUNT_SQL,
      args: ["run-one"],
    });
    assert.equal(matchingCard.rows[0]?.count, 0);
    const matchingSnapshot = await client.execute({
      sql: SNAPSHOT_APPLY_MISMATCH_COUNT_SQL,
      args: ["2026-07-27", "run-one"],
    });
    assert.equal(matchingSnapshot.rows[0]?.count, 0);

    const missingPriceRerun = completeCard();
    await client.execute(
      buildStageCardStatement(
        "run-two",
        buildSafeFullCard(missingPriceRerun, raw),
        getProviderPriceStates(missingPriceRerun as Record<string, unknown>),
        {
          cardmarketChanged: false,
          isNew: false,
          metadataChanged: false,
          tcgplayerChanged: false,
        },
      ),
    );
    await client.execute({
      sql: APPLY_DAILY_SNAPSHOTS_SQL,
      args: ["2026-07-27", "run-two"],
    });

    const sameDay = await client.execute(
      "SELECT tcgplayer_prices FROM price_snapshots WHERE card_id = 'base1-1'",
    );
    assert.equal(sameDay.rows.length, 1);
    assert.equal(
      JSON.parse(String(sameDay.rows[0].tcgplayer_prices)).holofoil.market,
      12,
    );
  } finally {
    client.close();
  }
});

test("a failed final batch rolls back every live change", async () => {
  const client = await createSyncDatabase();
  try {
    const existing = completeCard({
      tcgplayer: {
        prices: { holofoil: { market: 10 } },
        updatedAt: "old",
      },
    });
    await client.execute({
      sql: "INSERT INTO cards (id, name, raw_json) VALUES (?, ?, json(?))",
      args: [existing.id, existing.name, JSON.stringify(existing)],
    });
    const incoming = completeCard({
      tcgplayer: {
        prices: { holofoil: { market: 99 } },
        updatedAt: "new",
      },
    });
    await client.execute(
      buildStageCardStatement(
        "failed-run",
        buildSafeFullCard(incoming, existing as Record<string, unknown>),
        getProviderPriceStates(incoming as Record<string, unknown>),
        {
          cardmarketChanged: false,
          isNew: false,
          metadataChanged: false,
          tcgplayerChanged: true,
        },
      ),
    );

    await assert.rejects(
      client.batch(
        [
          {
            sql: APPLY_TCGPLAYER_PRICE_UPDATES_SQL,
            args: ["failed-run"],
          },
          "INSERT INTO missing_table VALUES (1)",
        ],
        "write",
      ),
    );
    const row = (
      await client.execute("SELECT raw_json FROM cards WHERE id = 'base1-1'")
    ).rows[0];
    const raw = JSON.parse(String(row.raw_json));
    assert.equal(raw.tcgplayer.prices.holofoil.market, 10);
  } finally {
    client.close();
  }
});

test("a price-only update can create a missing provider and removes a stale provider date", async () => {
  const client = await createSyncDatabase();
  try {
    const existing = completeCard({
      cardmarket: {
        prices: { trendPrice: 10 },
        updatedAt: "stale-date",
      },
    });
    await client.execute({
      sql: "INSERT INTO cards (id, name, raw_json) VALUES (?, ?, json(?))",
      args: [existing.id, existing.name, JSON.stringify(existing)],
    });
    const incoming = completeCard({
      cardmarket: {
        prices: { trendPrice: 11 },
      },
      tcgplayer: {
        prices: { normal: { market: 4 } },
        updatedAt: "2026/07/27",
      },
    });
    await client.execute(
      buildStageCardStatement(
        "price-only",
        buildSafeFullCard(incoming, existing as Record<string, unknown>),
        getProviderPriceStates(incoming as Record<string, unknown>),
        {
          cardmarketChanged: true,
          isNew: false,
          metadataChanged: false,
          tcgplayerChanged: true,
        },
      ),
    );

    const expectations = await client.execute({
      sql: PRICE_ONLY_APPLY_EXPECTATIONS_SQL,
      args: ["price-only"],
    });
    assert.equal(expectations.rows[0]?.tcgplayer_count, 1);
    assert.equal(expectations.rows[0]?.cardmarket_count, 1);

    await client.batch(
      [
        {
          sql: APPLY_TCGPLAYER_PRICE_UPDATES_SQL,
          args: ["price-only"],
        },
        {
          sql: APPLY_CARDMARKET_PRICE_UPDATES_SQL,
          args: ["price-only"],
        },
      ],
      "write",
    );

    const row = (
      await client.execute("SELECT raw_json FROM cards WHERE id = 'base1-1'")
    ).rows[0];
    const raw = JSON.parse(String(row.raw_json));
    assert.equal(raw.tcgplayer.prices.normal.market, 4);
    assert.equal(raw.tcgplayer.updatedAt, "2026/07/27");
    assert.equal(raw.cardmarket.prices.trendPrice, 11);
    assert.equal("updatedAt" in raw.cardmarket, false);
  } finally {
    client.close();
  }
});

test("sync lock blocks overlap and permits stale takeover", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    await client.execute(SCRIPT_LOCK_TABLE_SQL);
    const first = await client.execute(
      buildAcquireSyncLock(SCHEDULED_MAINTENANCE_LOCK_NAME, "one", 900),
    );
    assert.equal(first.rows[0]?.token, "one");
    const overlap = await client.execute(
      buildAcquireSyncLock(SCHEDULED_MAINTENANCE_LOCK_NAME, "two", 900),
    );
    assert.equal(overlap.rows.length, 0);

    await client.execute(
      "UPDATE sync_locks SET expires_at = unixepoch('now') - 1",
    );
    const takeover = await client.execute(
      buildAcquireSyncLock(SCHEDULED_MAINTENANCE_LOCK_NAME, "three", 900),
    );
    assert.equal(takeover.rows[0]?.token, "three");

    await client.execute(
      buildReleaseSyncLock(SCHEDULED_MAINTENANCE_LOCK_NAME, "one"),
    );
    const locked = await client.execute(
      "SELECT token FROM sync_locks WHERE name = ?",
      [SCHEDULED_MAINTENANCE_LOCK_NAME],
    );
    assert.equal(locked.rows[0]?.token, "three");
  } finally {
    client.close();
  }
});
