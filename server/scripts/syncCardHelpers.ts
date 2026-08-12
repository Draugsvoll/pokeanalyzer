import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard.js";

export type JsonObject = Record<string, unknown>;
export type PriceProvider = "tcgplayer" | "cardmarket";

export type ProviderPriceState = {
  prices: JsonObject | null;
  pricesProvided: boolean;
  updatedAt: string | null;
};

export type ProviderPriceStates = Record<PriceProvider, ProviderPriceState>;

export type CardColumns = {
  imageLarge: string | null;
  imageSmall: string | null;
  name: string;
  number: string | null;
  setId: string | null;
  setName: string | null;
};

export type SyncSqlStatement = {
  sql: string;
  args: Array<string | number | null>;
};

const PRESERVED_CARD_JSON_FIELDS = ["grok", "justtcg", "justtcgLookup"] as const;

const CLEAN_METADATA_RAW_JSON_SQL = `
  json_remove(
    json_remove(
      json_remove(json(stage.raw_json), '$.grok'),
      '$.justtcg'
    ),
    '$.justtcgLookup'
  )
`;

function restorePreservedJsonField(expression: string, field: string) {
  return `
    CASE
      WHEN json_type(cards.raw_json, '$.${field}') IS NOT NULL THEN
        json_set(
          ${expression},
          '$.${field}',
          json(json_extract(cards.raw_json, '$.${field}'))
        )
      ELSE ${expression}
    END
  `;
}

const PRESERVED_METADATA_RAW_JSON_SQL = PRESERVED_CARD_JSON_FIELDS.reduce(
  restorePreservedJsonField,
  CLEAN_METADATA_RAW_JSON_SQL,
);

export const CARD_SYNC_STAGE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS card_sync_stage (
    run_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    is_new INTEGER NOT NULL,
    metadata_changed INTEGER NOT NULL,
    tcgplayer_changed INTEGER NOT NULL,
    cardmarket_changed INTEGER NOT NULL,
    number TEXT,
    name TEXT NOT NULL,
    set_id TEXT,
    set_name TEXT,
    image_small TEXT,
    image_large TEXT,
    raw_json TEXT NOT NULL,
    tcgplayer_prices TEXT,
    cardmarket_prices TEXT,
    tcgplayer_updated_at TEXT,
    cardmarket_updated_at TEXT,
    PRIMARY KEY (run_id, card_id)
  )
`;

export const APPLY_METADATA_UPDATES_SQL = `
  UPDATE cards
  SET
    number = stage.number,
    name = stage.name,
    set_id = stage.set_id,
    set_name = stage.set_name,
    image_small = stage.image_small,
    image_large = stage.image_large,
    raw_json = ${PRESERVED_METADATA_RAW_JSON_SQL},
    updated_at = CURRENT_TIMESTAMP
  FROM card_sync_stage AS stage
  WHERE
    stage.run_id = ?
    AND stage.is_new = 0
    AND stage.metadata_changed = 1
    AND stage.card_id = cards.id
`;

export const APPLY_TCGPLAYER_PRICE_UPDATES_SQL = `
  UPDATE cards
  SET raw_json = CASE
    WHEN stage.tcgplayer_updated_at IS NULL THEN
      json_set(
        cards.raw_json,
        '$.tcgplayer',
        json_remove(
          json_set(
            COALESCE(
              json_extract(cards.raw_json, '$.tcgplayer'),
              json('{}')
            ),
            '$.prices',
            json(stage.tcgplayer_prices)
          ),
          '$.updatedAt'
        )
      )
    ELSE
      json_set(
        cards.raw_json,
        '$.tcgplayer',
        json_set(
          COALESCE(
            json_extract(cards.raw_json, '$.tcgplayer'),
            json('{}')
          ),
          '$.prices',
          json(stage.tcgplayer_prices),
          '$.updatedAt',
          stage.tcgplayer_updated_at
        )
      )
  END
  FROM card_sync_stage AS stage
  WHERE
    stage.run_id = ?
    AND stage.is_new = 0
    AND stage.metadata_changed = 0
    AND stage.tcgplayer_changed = 1
    AND stage.tcgplayer_prices IS NOT NULL
    AND stage.card_id = cards.id
`;

export const APPLY_CARDMARKET_PRICE_UPDATES_SQL = `
  UPDATE cards
  SET raw_json = CASE
    WHEN stage.cardmarket_updated_at IS NULL THEN
      json_set(
        cards.raw_json,
        '$.cardmarket',
        json_remove(
          json_set(
            COALESCE(
              json_extract(cards.raw_json, '$.cardmarket'),
              json('{}')
            ),
            '$.prices',
            json(stage.cardmarket_prices)
          ),
          '$.updatedAt'
        )
      )
    ELSE
      json_set(
        cards.raw_json,
        '$.cardmarket',
        json_set(
          COALESCE(
            json_extract(cards.raw_json, '$.cardmarket'),
            json('{}')
          ),
          '$.prices',
          json(stage.cardmarket_prices),
          '$.updatedAt',
          stage.cardmarket_updated_at
        )
      )
  END
  FROM card_sync_stage AS stage
  WHERE
    stage.run_id = ?
    AND stage.is_new = 0
    AND stage.metadata_changed = 0
    AND stage.cardmarket_changed = 1
    AND stage.cardmarket_prices IS NOT NULL
    AND stage.card_id = cards.id
`;

export const INSERT_NEW_CARDS_SQL = `
  INSERT INTO cards
  (
    id,
    number,
    name,
    set_id,
    set_name,
    image_small,
    image_large,
    raw_json,
    updated_at
  )
  SELECT
    stage.card_id,
    stage.number,
    stage.name,
    stage.set_id,
    stage.set_name,
    stage.image_small,
    stage.image_large,
    stage.raw_json,
    CURRENT_TIMESTAMP
  FROM card_sync_stage AS stage
  WHERE
    stage.run_id = ?
    AND stage.is_new = 1
`;

export const APPLY_DAILY_SNAPSHOTS_SQL = `
  INSERT INTO price_snapshots
  (
    card_id,
    recorded_at,
    tcgplayer_prices,
    cardmarket_prices,
    tcgplayer_updated_at,
    cardmarket_updated_at
  )
  SELECT
    stage.card_id,
    ?,
    stage.tcgplayer_prices,
    stage.cardmarket_prices,
    stage.tcgplayer_updated_at,
    stage.cardmarket_updated_at
  FROM card_sync_stage AS stage
  INNER JOIN cards ON cards.id = stage.card_id
  WHERE stage.run_id = ?
  ON CONFLICT(card_id, recorded_at) DO UPDATE SET
    tcgplayer_prices = CASE
      WHEN excluded.tcgplayer_prices IS NULL
      THEN price_snapshots.tcgplayer_prices
      ELSE excluded.tcgplayer_prices
    END,
    cardmarket_prices = CASE
      WHEN excluded.cardmarket_prices IS NULL
      THEN price_snapshots.cardmarket_prices
      ELSE excluded.cardmarket_prices
    END,
    tcgplayer_updated_at = CASE
      WHEN excluded.tcgplayer_prices IS NULL
      THEN price_snapshots.tcgplayer_updated_at
      ELSE excluded.tcgplayer_updated_at
    END,
    cardmarket_updated_at = CASE
      WHEN excluded.cardmarket_prices IS NULL
      THEN price_snapshots.cardmarket_updated_at
      ELSE excluded.cardmarket_updated_at
    END
`;

export const PRICE_ONLY_APPLY_EXPECTATIONS_SQL = `
  SELECT
    COALESCE(
      SUM(
        CASE
          WHEN
            is_new = 0
            AND metadata_changed = 0
            AND tcgplayer_changed = 1
            AND tcgplayer_prices IS NOT NULL
          THEN 1
          ELSE 0
        END
      ),
      0
    ) AS tcgplayer_count,
    COALESCE(
      SUM(
        CASE
          WHEN
            is_new = 0
            AND metadata_changed = 0
            AND cardmarket_changed = 1
            AND cardmarket_prices IS NOT NULL
          THEN 1
          ELSE 0
        END
      ),
      0
    ) AS cardmarket_count
  FROM card_sync_stage
  WHERE run_id = ?
`;

export const CARD_APPLY_MISMATCH_COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM card_sync_stage AS stage
  LEFT JOIN cards ON cards.id = stage.card_id
  WHERE
    stage.run_id = ?
    AND (
      cards.id IS NULL
      OR (
        (stage.is_new = 1 OR stage.metadata_changed = 1)
        AND (
          cards.number IS NOT stage.number
          OR cards.name IS NOT stage.name
          OR cards.set_id IS NOT stage.set_id
          OR cards.set_name IS NOT stage.set_name
          OR cards.image_small IS NOT stage.image_small
          OR cards.image_large IS NOT stage.image_large
        )
      )
      OR (
        stage.tcgplayer_prices IS NOT NULL
        AND (
          json(json_extract(cards.raw_json, '$.tcgplayer.prices'))
            IS NOT json(stage.tcgplayer_prices)
          OR json_extract(cards.raw_json, '$.tcgplayer.updatedAt')
            IS NOT stage.tcgplayer_updated_at
        )
      )
      OR (
        stage.cardmarket_prices IS NOT NULL
        AND (
          json(json_extract(cards.raw_json, '$.cardmarket.prices'))
            IS NOT json(stage.cardmarket_prices)
          OR json_extract(cards.raw_json, '$.cardmarket.updatedAt')
            IS NOT stage.cardmarket_updated_at
        )
      )
    )
`;

export const SNAPSHOT_APPLY_MISMATCH_COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM card_sync_stage AS stage
  LEFT JOIN price_snapshots AS snapshots
    ON snapshots.card_id = stage.card_id
    AND snapshots.recorded_at = ?
  WHERE
    stage.run_id = ?
    AND (
      snapshots.card_id IS NULL
      OR (
        stage.tcgplayer_prices IS NOT NULL
        AND (
          json(snapshots.tcgplayer_prices)
            IS NOT json(stage.tcgplayer_prices)
          OR snapshots.tcgplayer_updated_at
            IS NOT stage.tcgplayer_updated_at
        )
      )
      OR (
        stage.cardmarket_prices IS NOT NULL
        AND (
          json(snapshots.cardmarket_prices)
            IS NOT json(stage.cardmarket_prices)
          OR snapshots.cardmarket_updated_at
            IS NOT stage.cardmarket_updated_at
        )
      )
    )
`;

export const PRICE_HISTORY_CLEANUP_SQL = `
  DELETE FROM price_snapshots
  WHERE recorded_at < date(?, '-29 days')
    AND recorded_at < (
      SELECT MAX(newest.recorded_at)
      FROM price_snapshots AS newest
      WHERE newest.card_id = price_snapshots.card_id
    )
`;

export function buildAcquireSyncLock(
  name: string,
  token: string,
  ttlSeconds: number,
): SyncSqlStatement {
  return {
    sql: `
      INSERT INTO sync_locks (name, token, acquired_at, expires_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, unixepoch('now') + ?)
      ON CONFLICT(name) DO UPDATE SET
        token = excluded.token,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
      WHERE sync_locks.expires_at <= unixepoch('now')
      RETURNING token
    `,
    args: [name, token, ttlSeconds],
  };
}

export function buildRenewSyncLock(
  name: string,
  token: string,
  ttlSeconds: number,
): SyncSqlStatement {
  return {
    sql: `
      UPDATE sync_locks
      SET expires_at = unixepoch('now') + ?
      WHERE name = ? AND token = ?
    `,
    args: [ttlSeconds, name, token],
  };
}

export function buildReleaseSyncLock(
  name: string,
  token: string,
): SyncSqlStatement {
  return {
    sql: "DELETE FROM sync_locks WHERE name = ? AND token = ?",
    args: [name, token],
  };
}

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonObject(value: JsonObject): JsonObject {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isJsonObject(parsed)) throw new Error("Expected a JSON object");
  return parsed;
}

function removePreservedCardJsonFields(card: JsonObject) {
  for (const field of PRESERVED_CARD_JSON_FIELDS) {
    delete card[field];
  }
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function containsPositiveFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }
  if (Array.isArray(value)) {
    return value.some(containsPositiveFiniteNumber);
  }
  if (!isJsonObject(value)) return false;
  return Object.values(value).some(containsPositiveFiniteNumber);
}

export function sanitizeIncomingCard(
  card: PokemonTcgApiCard,
): PokemonTcgApiCard {
  if (!isJsonObject(card)) {
    throw new Error("The card API returned a non-object card");
  }

  const sanitized = cloneJsonObject(card);
  removePreservedCardJsonFields(sanitized);
  const set = isJsonObject(sanitized.set) ? sanitized.set : null;
  const images = isJsonObject(sanitized.images) ? sanitized.images : null;

  if (
    !hasText(sanitized.id) ||
    !hasText(sanitized.name) ||
    !hasText(sanitized.number) ||
    !hasText(sanitized.supertype) ||
    !hasText(set?.id) ||
    !hasText(set?.name) ||
    !hasText(images?.small) ||
    !hasText(images?.large)
  ) {
    const cardId = hasText(sanitized.id) ? sanitized.id : "unknown";
    throw new Error(`The card API returned incomplete metadata for ${cardId}`);
  }

  return sanitized as PokemonTcgApiCard;
}

export function parseStoredCard(rawJson: unknown, cardId: string): JsonObject {
  if (typeof rawJson !== "string") {
    throw new Error(`Card ${cardId} contains non-text raw_json`);
  }
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!isJsonObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new Error(`Card ${cardId} contains invalid raw_json`);
  }
}

export function getProviderPriceState(
  card: JsonObject,
  providerName: PriceProvider,
): ProviderPriceState {
  const provider = card[providerName];
  if (!isJsonObject(provider)) {
    return {
      prices: null,
      pricesProvided: false,
      updatedAt: null,
    };
  }

  const pricesProvided = Object.prototype.hasOwnProperty.call(
    provider,
    "prices",
  );
  const prices =
    isJsonObject(provider.prices) &&
    containsPositiveFiniteNumber(provider.prices)
      ? cloneJsonObject(provider.prices)
      : null;
  const updatedAt =
    typeof provider.updatedAt === "string" &&
    provider.updatedAt.trim().length > 0
      ? provider.updatedAt.trim()
      : null;

  return { prices, pricesProvided, updatedAt };
}

export function getProviderPriceStates(card: JsonObject): ProviderPriceStates {
  return {
    cardmarket: getProviderPriceState(card, "cardmarket"),
    tcgplayer: getProviderPriceState(card, "tcgplayer"),
  };
}

/**
 * Use the complete upstream card. Grok is restored later from the live row.
 * A missing/invalid provider price is the sole exception: the last usable
 * current price and its matching date are retained for the card display.
 */
export function buildSafeFullCard(
  incomingCard: PokemonTcgApiCard,
  existingCard?: JsonObject,
): PokemonTcgApiCard {
  const safeCard = cloneJsonObject(incomingCard);
  removePreservedCardJsonFields(safeCard);

  for (const providerName of [
    "tcgplayer",
    "cardmarket",
  ] satisfies PriceProvider[]) {
    const incomingState = getProviderPriceState(safeCard, providerName);
    const existingState = existingCard
      ? getProviderPriceState(existingCard, providerName)
      : null;
    const incomingProvider = isJsonObject(safeCard[providerName])
      ? cloneJsonObject(safeCard[providerName])
      : null;
    const existingProvider =
      existingCard && isJsonObject(existingCard[providerName])
        ? cloneJsonObject(existingCard[providerName])
        : null;

    let provider = incomingProvider;
    if (!incomingState.prices && existingState?.prices) {
      provider = incomingProvider ?? existingProvider ?? {};
      provider.prices = existingState.prices;
      if (existingState.updatedAt) {
        provider.updatedAt = existingState.updatedAt;
      } else {
        delete provider.updatedAt;
      }
    } else if (incomingState.prices) {
      provider = incomingProvider ?? {};
      provider.prices = incomingState.prices;
      if (incomingState.updatedAt) {
        provider.updatedAt = incomingState.updatedAt;
      } else {
        delete provider.updatedAt;
      }
    } else if (provider) {
      delete provider.prices;
      delete provider.updatedAt;
    }

    if (provider && Object.keys(provider).length > 0) {
      safeCard[providerName] = provider;
    } else {
      delete safeCard[providerName];
    }
  }

  return safeCard as PokemonTcgApiCard;
}

function metadataOnlyCard(card: JsonObject): JsonObject {
  const metadata = cloneJsonObject(card);
  removePreservedCardJsonFields(metadata);

  for (const providerName of [
    "tcgplayer",
    "cardmarket",
  ] satisfies PriceProvider[]) {
    const provider = metadata[providerName];
    if (!isJsonObject(provider)) continue;
    delete provider.prices;
    delete provider.updatedAt;
    if (Object.keys(provider).length === 0) delete metadata[providerName];
  }
  return metadata;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

export function metadataSignature(card: JsonObject): string {
  return JSON.stringify(sortJson(metadataOnlyCard(card)));
}

export function providerPriceChanged(
  incoming: ProviderPriceState,
  existing: ProviderPriceState,
): boolean {
  if (!incoming.prices) return false;
  return (
    JSON.stringify(sortJson(incoming.prices)) !==
      JSON.stringify(sortJson(existing.prices)) ||
    incoming.updatedAt !== existing.updatedAt
  );
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function getCardColumns(card: JsonObject): CardColumns {
  const set = isJsonObject(card.set) ? card.set : null;
  const images = isJsonObject(card.images) ? card.images : null;
  return {
    imageLarge: optionalText(images?.large),
    imageSmall: optionalText(images?.small),
    name: String(card.name),
    number: optionalText(card.number),
    setId: optionalText(set?.id),
    setName: optionalText(set?.name),
  };
}

export function buildStageCardStatement(
  runId: string,
  card: PokemonTcgApiCard,
  states: ProviderPriceStates,
  options: {
    cardmarketChanged: boolean;
    isNew: boolean;
    metadataChanged: boolean;
    tcgplayerChanged: boolean;
  },
): SyncSqlStatement {
  const columns = getCardColumns(card);
  return {
    sql: `
      INSERT INTO card_sync_stage
      (
        run_id,
        card_id,
        is_new,
        metadata_changed,
        tcgplayer_changed,
        cardmarket_changed,
        number,
        name,
        set_id,
        set_name,
        image_small,
        image_large,
        raw_json,
        tcgplayer_prices,
        cardmarket_prices,
        tcgplayer_updated_at,
        cardmarket_updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      runId,
      card.id,
      options.isNew ? 1 : 0,
      options.metadataChanged ? 1 : 0,
      options.tcgplayerChanged ? 1 : 0,
      options.cardmarketChanged ? 1 : 0,
      columns.number,
      columns.name,
      columns.setId,
      columns.setName,
      columns.imageSmall,
      columns.imageLarge,
      JSON.stringify(card),
      states.tcgplayer.prices ? JSON.stringify(states.tcgplayer.prices) : null,
      states.cardmarket.prices
        ? JSON.stringify(states.cardmarket.prices)
        : null,
      states.tcgplayer.prices ? states.tcgplayer.updatedAt : null,
      states.cardmarket.prices ? states.cardmarket.updatedAt : null,
    ],
  };
}
