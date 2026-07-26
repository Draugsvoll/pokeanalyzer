import type { PokemonTcgApiCard } from "../types/PokemonTcgApiCard.js";

export type JsonObject = Record<string, unknown>;
export type PriceProvider = "tcgplayer" | "cardmarket";

export type ProviderPriceState = {
  prices: JsonObject | null;
  updatedAt: string | null;
};

export type ProviderPriceStates = Record<PriceProvider, ProviderPriceState>;

export type CardColumns = {
  number: string | null;
  name: string;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
};

export type SyncSqlStatement = {
  sql: string;
  args: Array<string | number | null>;
};

const FULL_CARD_UPSERT_SQL = `
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
  VALUES (?, ?, ?, ?, ?, ?, ?, json(?), CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    number = excluded.number,
    name = excluded.name,
    set_id = excluded.set_id,
    set_name = excluded.set_name,
    image_small = excluded.image_small,
    image_large = excluded.image_large,
    raw_json = CASE
      WHEN json_valid(cards.raw_json) = 1 THEN
        CASE
          WHEN json_type(cards.raw_json, '$.grok') IS NOT NULL
          THEN json_set(
            excluded.raw_json,
            '$.grok',
            json_extract(cards.raw_json, '$.grok')
          )
          ELSE excluded.raw_json
        END
      ELSE excluded.raw_json
    END,
    updated_at = CURRENT_TIMESTAMP
`;

const SNAPSHOT_UPSERT_SQL = `
  INSERT INTO price_snapshots
  (
    card_id,
    recorded_at,
    tcgplayer_prices,
    cardmarket_prices,
    tcgplayer_updated_at,
    cardmarket_updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(card_id, recorded_at) DO UPDATE SET
    tcgplayer_prices = COALESCE(
      excluded.tcgplayer_prices,
      price_snapshots.tcgplayer_prices
    ),
    cardmarket_prices = COALESCE(
      excluded.cardmarket_prices,
      price_snapshots.cardmarket_prices
    ),
    tcgplayer_updated_at = CASE
      WHEN excluded.tcgplayer_prices IS NULL
      THEN price_snapshots.tcgplayer_updated_at
      ELSE COALESCE(
        excluded.tcgplayer_updated_at,
        price_snapshots.tcgplayer_updated_at
      )
    END,
    cardmarket_updated_at = CASE
      WHEN excluded.cardmarket_prices IS NULL
      THEN price_snapshots.cardmarket_updated_at
      ELSE COALESCE(
        excluded.cardmarket_updated_at,
        price_snapshots.cardmarket_updated_at
      )
    END
`;

export const PRICE_HISTORY_CLEANUP_SQL = `
  DELETE FROM price_snapshots
  WHERE recorded_at < date('now', '-30 days')
    AND recorded_at < (
      SELECT MAX(newest.recorded_at)
      FROM price_snapshots AS newest
      WHERE newest.card_id = price_snapshots.card_id
    )
`;

export const SYNC_LOCK_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sync_locks (
    name TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER NOT NULL
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
  const serialized = JSON.stringify(value);
  const parsed: unknown = JSON.parse(serialized);

  if (!isJsonObject(parsed)) {
    throw new Error("Expected a JSON object");
  }

  return parsed;
}

/**
 * Validate and detach an upstream API card from the Axios response. `grok` is
 * always removed because it is application-owned data, never upstream data.
 */
export function sanitizeIncomingCard(
  card: PokemonTcgApiCard,
): PokemonTcgApiCard {
  if (!isJsonObject(card)) {
    throw new Error("The card API returned a non-object card");
  }

  const sanitized = cloneJsonObject(card);
  delete sanitized.grok;

  const hasText = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;
  const set = isJsonObject(sanitized.set) ? sanitized.set : null;
  const images = isJsonObject(sanitized.images) ? sanitized.images : null;

  // These fields are stable invariants in a complete Pokémon TCG API card.
  // Refuse a suspiciously partial response before the page transaction is
  // built, so a transient/truncated payload cannot erase stored metadata.
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
    throw new Error(
      `The card API returned an incomplete card (${cardId}); refusing to overwrite stored metadata`,
    );
  }

  return sanitized as PokemonTcgApiCard;
}

export function parseStoredCard(rawJson: unknown, cardId: string): JsonObject {
  if (typeof rawJson !== "string") {
    throw new Error(`Card ${cardId} contains non-text raw_json`);
  }

  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!isJsonObject(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    // Refuse to overwrite malformed application data during a catalog refresh.
    throw new Error(`Card ${cardId} contains invalid raw_json`);
  }
}

function mergeMissingObjectFields(
  existing: JsonObject,
  incoming: JsonObject,
): JsonObject {
  const merged = cloneJsonObject(existing);

  for (const [key, incomingValue] of Object.entries(incoming)) {
    const existingValue = merged[key];
    merged[key] =
      isJsonObject(existingValue) && isJsonObject(incomingValue)
        ? mergeMissingObjectFields(existingValue, incomingValue)
        : incomingValue;
  }

  return merged;
}

/**
 * Conservatively overlay an upstream card on the stored card. Fields supplied
 * by the API are updated, while omitted root/nested metadata and custom fields
 * survive a partial response. Live Grok is still merged in SQL at write time.
 */
export function preserveOmittedCardFields(
  incomingCard: PokemonTcgApiCard,
  existingCard: JsonObject,
): PokemonTcgApiCard {
  const merged = mergeMissingObjectFields(existingCard, incomingCard);

  for (const providerName of [
    "tcgplayer",
    "cardmarket",
  ] satisfies PriceProvider[]) {
    const existingProvider = isJsonObject(existingCard[providerName])
      ? existingCard[providerName]
      : null;
    const incomingProvider = isJsonObject(incomingCard[providerName])
      ? incomingCard[providerName]
      : null;
    if (!existingProvider && !incomingProvider) {
      delete merged[providerName];
      continue;
    }

    const existingMetadata = cloneJsonObject(existingProvider ?? {});
    const incomingMetadata = cloneJsonObject(incomingProvider ?? {});
    delete existingMetadata.prices;
    delete existingMetadata.updatedAt;
    delete incomingMetadata.prices;
    delete incomingMetadata.updatedAt;

    const provider = mergeMissingObjectFields(
      existingMetadata,
      incomingMetadata,
    );
    if (
      incomingProvider &&
      Object.prototype.hasOwnProperty.call(incomingProvider, "prices")
    ) {
      provider.prices = incomingProvider.prices;
    }
    if (
      incomingProvider &&
      Object.prototype.hasOwnProperty.call(incomingProvider, "updatedAt")
    ) {
      provider.updatedAt = incomingProvider.updatedAt;
    }
    merged[providerName] = provider;
  }

  delete merged.grok;
  return merged as PokemonTcgApiCard;
}

function containsFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsFiniteNumber);
  if (!isJsonObject(value)) return false;
  return Object.values(value).some(containsFiniteNumber);
}

/**
 * Empty/all-null objects are treated as missing price data. This prevents a
 * temporary upstream gap from erasing a previously usable current price.
 */
export function getProviderPriceState(
  card: JsonObject,
  providerName: PriceProvider,
): ProviderPriceState {
  const provider = card[providerName];
  if (!isJsonObject(provider)) {
    return { prices: null, updatedAt: null };
  }

  const prices =
    isJsonObject(provider.prices) && containsFiniteNumber(provider.prices)
      ? provider.prices
      : null;
  const updatedAt =
    typeof provider.updatedAt === "string" && provider.updatedAt.length > 0
      ? provider.updatedAt
      : null;

  return { prices, updatedAt };
}

/**
 * A metadata refresh uses the full upstream card, but keeps the last usable
 * provider price/timestamp when that provider is missing in the new response.
 * Grok is intentionally handled in SQL at write time for concurrency safety.
 */
export function preserveMissingCurrentPrices(
  incomingCard: PokemonTcgApiCard,
  existingCard: JsonObject,
): PokemonTcgApiCard {
  const merged = cloneJsonObject(incomingCard);

  for (const providerName of [
    "tcgplayer",
    "cardmarket",
  ] satisfies PriceProvider[]) {
    const existingProvider = isJsonObject(existingCard[providerName])
      ? existingCard[providerName]
      : null;
    const incomingProvider = isJsonObject(merged[providerName])
      ? merged[providerName]
      : null;
    if (!existingProvider && !incomingProvider) continue;

    // Provider responses can temporarily be partial. Keep existing URL/other
    // provider metadata unless the incoming response explicitly replaces it.
    const provider: JsonObject = {
      ...(existingProvider ?? {}),
      ...(incomingProvider ?? {}),
    };
    const incoming = getProviderPriceState(merged, providerName);
    const existing = getProviderPriceState(existingCard, providerName);

    if (!incoming.prices && existing.prices) {
      provider.prices = existing.prices;
      if (existing.updatedAt) {
        provider.updatedAt = existing.updatedAt;
      } else {
        delete provider.updatedAt;
      }
    } else if (!incoming.updatedAt) {
      if (existing.updatedAt) {
        provider.updatedAt = existing.updatedAt;
      } else {
        delete provider.updatedAt;
      }
    }

    merged[providerName] = provider;
  }

  return merged as PokemonTcgApiCard;
}

function metadataOnlyCard(card: JsonObject): JsonObject {
  const metadata = cloneJsonObject(card);
  delete metadata.grok;

  for (const providerName of [
    "tcgplayer",
    "cardmarket",
  ] satisfies PriceProvider[]) {
    const provider = metadata[providerName];
    if (!isJsonObject(provider)) continue;

    delete provider.prices;
    delete provider.updatedAt;

    if (Object.keys(provider).length === 0) {
      delete metadata[providerName];
    }
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

/** A deterministic comparison value that ignores prices, price dates, and Grok. */
export function metadataSignature(card: JsonObject): string {
  return JSON.stringify(sortJson(metadataOnlyCard(card)));
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function getCardColumns(card: JsonObject): CardColumns {
  const set = isJsonObject(card.set) ? card.set : null;
  const images = isJsonObject(card.images) ? card.images : null;

  return {
    number: optionalText(card.number),
    name: String(card.name),
    setId: optionalText(set?.id),
    setName: optionalText(set?.name),
    imageSmall: optionalText(images?.small),
    imageLarge: optionalText(images?.large),
  };
}

/**
 * Full metadata refresh/new-card statement. On conflict, Grok is read from the
 * live row inside the same SQL statement and merged into the upstream card.
 */
export function buildFullCardUpsert(
  card: PokemonTcgApiCard,
): SyncSqlStatement {
  const columns = getCardColumns(card);

  return {
    sql: FULL_CARD_UPSERT_SQL,
    args: [
      card.id,
      columns.number,
      columns.name,
      columns.setId,
      columns.setName,
      columns.imageSmall,
      columns.imageLarge,
      JSON.stringify(card),
    ],
  };
}

/**
 * Update only current price paths. Metadata, Grok, denormalized columns, and
 * cards.updated_at remain untouched.
 */
export function buildPriceOnlyUpdate(
  cardId: string,
  states: ProviderPriceStates,
): SyncSqlStatement | null {
  let jsonExpression = "raw_json";
  const args: Array<string | number | null> = [];

  for (const providerName of [
    "tcgplayer",
    "cardmarket",
  ] satisfies PriceProvider[]) {
    const state = states[providerName];
    if (!state.prices) continue;

    const pricePath = `$.${providerName}.prices`;
    const updatedAtPath = `$.${providerName}.updatedAt`;
    const updatedAtSql = state.updatedAt ? `, '${updatedAtPath}', ?` : "";

    jsonExpression = `json_set(
      ${jsonExpression},
      '${pricePath}',
      json(?)
      ${updatedAtSql}
    )`;
    args.push(JSON.stringify(state.prices));
    if (state.updatedAt) args.push(state.updatedAt);
  }

  if (args.length === 0) return null;

  args.push(cardId);
  return {
    sql: `
      UPDATE cards
      SET raw_json = ${jsonExpression}
      WHERE id = ?
    `,
    args,
  };
}

/**
 * Missing providers are bound as real SQL NULL values. On a same-day rerun,
 * NULL can never replace price/timestamp data already captured that day.
 */
export function buildSnapshotUpsert(
  cardId: string,
  states: ProviderPriceStates,
  recordedAt: string,
): SyncSqlStatement | null {
  const tcgplayer = states.tcgplayer;
  const cardmarket = states.cardmarket;
  if (!tcgplayer.prices && !cardmarket.prices) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    throw new Error("recordedAt must be an ISO calendar date");
  }

  return {
    sql: SNAPSHOT_UPSERT_SQL,
    args: [
      cardId,
      recordedAt,
      tcgplayer.prices ? JSON.stringify(tcgplayer.prices) : null,
      cardmarket.prices ? JSON.stringify(cardmarket.prices) : null,
      tcgplayer.prices ? tcgplayer.updatedAt : null,
      cardmarket.prices ? cardmarket.updatedAt : null,
    ],
  };
}
