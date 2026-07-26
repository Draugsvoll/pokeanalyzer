import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard.js";
import {
  buildAcquireSyncLock,
  buildFullCardUpsert,
  buildPriceOnlyUpdate,
  buildReleaseSyncLock,
  buildSnapshotUpsert,
  getProviderPriceState,
  isJsonObject,
  metadataSignature,
  PRICE_HISTORY_CLEANUP_SQL,
  preserveMissingCurrentPrices,
  preserveOmittedCardFields,
  sanitizeIncomingCard,
  SYNC_LOCK_TABLE_SQL,
} from "./syncCardHelpers.js";

test("incomplete upstream cards are rejected before they can erase metadata", () => {
  assert.throws(
    () =>
      sanitizeIncomingCard({
        id: "base1-1",
        name: "Alakazam",
      }),
    /incomplete card/,
  );

  assert.doesNotThrow(() =>
    sanitizeIncomingCard({
      id: "base1-1",
      images: {
        large: "https://example.test/large.png",
        small: "https://example.test/small.png",
      },
      name: "Alakazam",
      number: "1",
      set: {
        id: "base1",
        name: "Base",
      },
      supertype: "Pokémon",
    }),
  );
});

test("metadata comparison ignores current prices, provider dates, and Grok", () => {
  const stored = {
    id: "base1-1",
    name: "Alakazam",
    tcgplayer: {
      url: "https://example.test/tcg",
      updatedAt: "2026/07/25",
      prices: { holofoil: { market: 10 } },
    },
    grok: { price_analysis: { summary: "keep me" } },
  };
  const incoming = {
    tcgplayer: {
      prices: { holofoil: { market: 12 } },
      updatedAt: "2026/07/26",
      url: "https://example.test/tcg",
    },
    name: "Alakazam",
    id: "base1-1",
  };

  assert.equal(metadataSignature(stored), metadataSignature(incoming));
  assert.notEqual(
    metadataSignature(stored),
    metadataSignature({ ...incoming, name: "Kadabra" }),
  );
});

test("partial providers retain existing metadata and their last usable price", () => {
  const existing = {
    id: "base1-1",
    name: "Alakazam",
    tcgplayer: {
      url: "https://example.test/old-tcg-url",
      customProviderField: "retain",
      updatedAt: "2026/07/25",
      prices: { holofoil: { market: 10 } },
    },
  };
  const incoming: PokemonTcgApiCard = {
    id: "base1-1",
    name: "Alakazam updated",
    tcgplayer: {
      // A temporarily partial provider object has neither URL nor prices.
      updatedAt: "2026/07/26",
    },
  };

  const merged = preserveMissingCurrentPrices(incoming, existing);
  assert.equal(merged.tcgplayer?.url, "https://example.test/old-tcg-url");
  assert.equal(
    (merged.tcgplayer as Record<string, unknown>).customProviderField,
    "retain",
  );
  assert.equal(merged.tcgplayer?.updatedAt, "2026/07/25");
  assert.deepEqual(merged.tcgplayer?.prices, {
    holofoil: { market: 10 },
  });
});

test("omitted upstream fields cannot erase stored metadata or custom fields", () => {
  const existing = {
    abilities: [{ name: "Damage Swap" }],
    appAnnotation: { reviewed: true },
    id: "base1-1",
    images: {
      large: "https://example.test/old-large.png",
      small: "https://example.test/old-small.png",
    },
    name: "Alakazam",
    number: "1",
    set: {
      id: "base1",
      images: { logo: "https://example.test/logo.png" },
      name: "Base",
    },
    supertype: "Pokémon",
  };
  const incoming: PokemonTcgApiCard = {
    id: "base1-1",
    images: {
      large: "https://example.test/new-large.png",
      small: "https://example.test/new-small.png",
    },
    name: "Alakazam corrected",
    number: "1",
    set: {
      id: "base1",
      name: "Base",
    },
    supertype: "Pokémon",
  };

  const merged = preserveOmittedCardFields(incoming, existing);
  assert.equal(merged.name, "Alakazam corrected");
  assert.equal(merged.images?.large, "https://example.test/new-large.png");
  assert.deepEqual(merged.abilities, existing.abilities);
  assert.deepEqual(merged.appAnnotation, existing.appAnnotation);
  assert.deepEqual(merged.set?.images, existing.set.images);
});

test("metadata safety never merges stale variants or mismatched price dates", () => {
  const existing = {
    id: "base1-1",
    name: "Alakazam",
    tcgplayer: {
      prices: {
        holofoil: { market: 10 },
        normal: { market: 8 },
      },
      updatedAt: "2026/07/25",
      url: "https://example.test/tcg",
    },
  };
  const changedWithPrices: PokemonTcgApiCard = {
    id: "base1-1",
    name: "Alakazam corrected",
    tcgplayer: {
      prices: { normal: { market: 9 } },
      updatedAt: "2026/07/26",
    },
  };

  const safeMetadata = preserveOmittedCardFields(
    changedWithPrices,
    existing,
  );
  const safePrices = preserveMissingCurrentPrices(safeMetadata, existing);
  assert.deepEqual(safePrices.tcgplayer, {
    prices: { normal: { market: 9 } },
    updatedAt: "2026/07/26",
    url: "https://example.test/tcg",
  });

  const partialProvider: PokemonTcgApiCard = {
    id: "base1-1",
    name: "Alakazam corrected again",
    tcgplayer: { updatedAt: "2026/07/27" },
  };
  const partialSafeMetadata = preserveOmittedCardFields(
    partialProvider,
    existing,
  );
  const partialSafePrices = preserveMissingCurrentPrices(
    partialSafeMetadata,
    existing,
  );
  assert.deepEqual(partialSafePrices.tcgplayer, existing.tcgplayer);
});

test("all-null provider payloads are missing, while a numeric zero is usable", () => {
  const missing = getProviderPriceState(
    {
      tcgplayer: {
        prices: { holofoil: { market: null, low: null } },
      },
    },
    "tcgplayer",
  );
  const usable = getProviderPriceState(
    {
      tcgplayer: {
        prices: { holofoil: { market: 0 } },
      },
    },
    "tcgplayer",
  );

  assert.equal(missing.prices, null);
  assert.notEqual(usable.prices, null);
});

test("full-card UPSERT refreshes metadata but preserves live Grok atomically", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    await client.execute(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        number TEXT,
        name TEXT NOT NULL,
        set_id TEXT,
        set_name TEXT,
        image_small TEXT,
        image_large TEXT,
        raw_json TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const stored = {
      id: "base1-1",
      name: "Old name",
      rarity: "Rare",
      grok: {
        price_analysis: {
          timestamp: "2026-07-25T00:00:00.000Z",
          summary: "must survive",
        },
      },
    };
    await client.execute({
      sql: `
        INSERT INTO cards (id, name, raw_json, updated_at)
        VALUES (?, ?, json(?), '2000-01-01 00:00:00')
      `,
      args: [stored.id, stored.name, JSON.stringify(stored)],
    });

    const upstream: PokemonTcgApiCard = {
      id: "base1-1",
      number: "1",
      name: "New name",
      rarity: "Ultra Rare",
    };
    await client.batch([buildFullCardUpsert(upstream)], "write");

    const result = await client.execute({
      sql: "SELECT name, raw_json FROM cards WHERE id = ?",
      args: [upstream.id],
    });
    const row = result.rows[0];
    assert.equal(row?.name, "New name");

    const raw: unknown = JSON.parse(String(row?.raw_json));
    assert.ok(isJsonObject(raw));
    assert.equal(raw.name, "New name");
    assert.equal(raw.rarity, "Ultra Rare");
    assert.deepEqual(raw.grok, stored.grok);
  } finally {
    client.close();
  }
});

test("price writes preserve card data and use/protect real SQL NULL snapshots", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    await client.batch(
      [
        `
          CREATE TABLE cards (
            id TEXT PRIMARY KEY,
            number TEXT,
            name TEXT NOT NULL,
            set_id TEXT,
            set_name TEXT,
            image_small TEXT,
            image_large TEXT,
            raw_json TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `,
        `
          CREATE TABLE price_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            card_id TEXT NOT NULL,
            recorded_at DATE NOT NULL,
            tcgplayer_prices TEXT,
            cardmarket_prices TEXT,
            tcgplayer_updated_at TEXT,
            cardmarket_updated_at TEXT,
            UNIQUE(card_id, recorded_at)
          )
        `,
      ],
      "write",
    );

    const stored = {
      id: "base1-2",
      name: "Blastoise",
      rarity: "Rare",
      tcgplayer: {
        updatedAt: "2026/07/25",
        prices: { holofoil: { market: 10 } },
      },
      cardmarket: {
        updatedAt: "2026/07/25",
        prices: { trendPrice: 20 },
      },
      grok: { ebay: { summary: "keep me too" } },
    };
    await client.execute({
      sql: `
        INSERT INTO cards (id, name, raw_json, updated_at)
        VALUES (?, ?, json(?), '2000-01-01 00:00:00')
      `,
      args: [stored.id, stored.name, JSON.stringify(stored)],
    });

    const missingCardmarketStates = {
      tcgplayer: {
        prices: { holofoil: { market: 12 } },
        updatedAt: "2026/07/26",
      },
      cardmarket: { prices: null, updatedAt: null },
    };
    const priceUpdate = buildPriceOnlyUpdate(
      stored.id,
      missingCardmarketStates,
    );
    const firstSnapshot = buildSnapshotUpsert(
      stored.id,
      missingCardmarketStates,
      "2026-07-26",
    );
    assert.ok(priceUpdate);
    assert.ok(firstSnapshot);
    await client.batch([priceUpdate, firstSnapshot], "write");

    const cardResult = await client.execute({
      sql: "SELECT raw_json, updated_at FROM cards WHERE id = ?",
      args: [stored.id],
    });
    const updatedRaw: unknown = JSON.parse(
      String(cardResult.rows[0]?.raw_json),
    );
    assert.ok(isJsonObject(updatedRaw));
    assert.deepEqual(updatedRaw.grok, stored.grok);
    assert.equal(updatedRaw.name, stored.name);
    assert.deepEqual(updatedRaw.cardmarket, stored.cardmarket);
    assert.deepEqual(updatedRaw.tcgplayer, {
      updatedAt: "2026/07/26",
      prices: { holofoil: { market: 12 } },
    });
    assert.equal(cardResult.rows[0]?.updated_at, "2000-01-01 00:00:00");

    const firstSnapshotResult = await client.execute({
      sql: `
        SELECT cardmarket_prices
        FROM price_snapshots
        WHERE card_id = ?
      `,
      args: [stored.id],
    });
    assert.equal(firstSnapshotResult.rows[0]?.cardmarket_prices, null);

    const complementaryRerunSnapshot = buildSnapshotUpsert(
      stored.id,
      {
        tcgplayer: { prices: null, updatedAt: null },
        cardmarket: {
          prices: { trendPrice: 22 },
          updatedAt: "2026/07/26",
        },
      },
      "2026-07-26",
    );
    assert.ok(complementaryRerunSnapshot);
    await client.execute(complementaryRerunSnapshot);

    const rerunResult = await client.execute({
      sql: `
        SELECT
          tcgplayer_prices,
          cardmarket_prices,
          tcgplayer_updated_at,
          cardmarket_updated_at,
          recorded_at
        FROM price_snapshots
        WHERE card_id = ?
      `,
      args: [stored.id],
    });
    assert.deepEqual(
      JSON.parse(String(rerunResult.rows[0]?.tcgplayer_prices)),
      { holofoil: { market: 12 } },
    );
    assert.deepEqual(
      JSON.parse(String(rerunResult.rows[0]?.cardmarket_prices)),
      { trendPrice: 22 },
    );
    assert.equal(rerunResult.rows[0]?.tcgplayer_updated_at, "2026/07/26");
    assert.equal(
      rerunResult.rows[0]?.cardmarket_updated_at,
      "2026/07/26",
    );
    assert.equal(rerunResult.rows[0]?.recorded_at, "2026-07-26");
  } finally {
    client.close();
  }
});

test("libSQL accepts a maximum-size sync page as one local atomic batch", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    await client.execute("CREATE TABLE batch_test (id INTEGER PRIMARY KEY)");
    const statements = Array.from({ length: 500 }, (_, id) => ({
      sql: "INSERT INTO batch_test (id) VALUES (?)",
      args: [id],
    }));

    await client.batch(statements, "write");
    const result = await client.execute(
      "SELECT COUNT(*) AS count FROM batch_test",
    );
    assert.equal(Number(result.rows[0]?.count), 500);

    await assert.rejects(
      client.batch(
        [
          {
            sql: "INSERT INTO batch_test (id) VALUES (?)",
            args: [1000],
          },
          {
            sql: "INSERT INTO batch_test (id) VALUES (?)",
            args: [0],
          },
        ],
        "write",
      ),
    );
    const rolledBack = await client.execute(
      "SELECT COUNT(*) AS count FROM batch_test WHERE id = 1000",
    );
    assert.equal(Number(rolledBack.rows[0]?.count), 0);
  } finally {
    client.close();
  }
});

test("history cleanup always retains each card's newest snapshot", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    await client.execute(`
      CREATE TABLE price_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        recorded_at DATE NOT NULL,
        UNIQUE(card_id, recorded_at)
      )
    `);
    await client.batch(
      [
        {
          sql: `
            INSERT INTO price_snapshots (card_id, recorded_at)
            VALUES ('active-card', date('now', '-60 days'))
          `,
          args: [],
        },
        {
          sql: `
            INSERT INTO price_snapshots (card_id, recorded_at)
            VALUES ('active-card', date('now'))
          `,
          args: [],
        },
        {
          sql: `
            INSERT INTO price_snapshots (card_id, recorded_at)
            VALUES ('missing-card', date('now', '-60 days'))
          `,
          args: [],
        },
      ],
      "write",
    );

    await client.execute(PRICE_HISTORY_CLEANUP_SQL);
    const result = await client.execute(`
      SELECT card_id, recorded_at
      FROM price_snapshots
      ORDER BY card_id, recorded_at
    `);

    assert.deepEqual(
      result.rows.map((row) => String(row.card_id)),
      ["active-card", "missing-card"],
    );
  } finally {
    client.close();
  }
});

test("sync lock blocks overlap, permits stale takeover, and uses token release", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    await client.execute(SYNC_LOCK_TABLE_SQL);

    const first = await client.execute(
      buildAcquireSyncLock("card-sync", "token-one", 900),
    );
    assert.equal(first.rows[0]?.token, "token-one");

    const overlapping = await client.execute(
      buildAcquireSyncLock("card-sync", "token-two", 900),
    );
    assert.equal(overlapping.rows.length, 0);

    await client.execute(
      "UPDATE sync_locks SET expires_at = unixepoch('now') - 1",
    );
    const takeover = await client.execute(
      buildAcquireSyncLock("card-sync", "token-three", 900),
    );
    assert.equal(takeover.rows[0]?.token, "token-three");

    await client.execute(buildReleaseSyncLock("card-sync", "token-one"));
    const stillLocked = await client.execute(
      "SELECT token FROM sync_locks WHERE name = 'card-sync'",
    );
    assert.equal(stillLocked.rows[0]?.token, "token-three");

    await client.execute(buildReleaseSyncLock("card-sync", "token-three"));
    const released = await client.execute("SELECT * FROM sync_locks");
    assert.equal(released.rows.length, 0);
  } finally {
    client.close();
  }
});
