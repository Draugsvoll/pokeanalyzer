import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { dbAll, dbGet } from "./db.js";
import { parseStoredCard } from "./cardSerialization.js";

export const CARD_CATALOG_SCHEMA_VERSION = 1;

const gzipAsync = promisify(gzip);
const CATALOG_PAGE_SIZE = 500;

type JsonObject = Record<string, unknown>;

type CatalogMetadataRow = {
  card_count: number | bigint;
  content_size: number | bigint | null;
  latest_update: string | null;
  update_clock: number | bigint | null;
};

type CatalogPageRow = {
  row_id: number | bigint;
  raw_json: string;
};

type CatalogMetadata = {
  cardCount: number;
  sourceVersion: string;
};

type CatalogPayload = {
  gzip: Buffer;
  json: string;
};

let pendingCatalog: Promise<CatalogPayload> | null = null;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Fields needed by search results and the immediately rendered card overview. */
export function toCatalogCard(card: JsonObject): JsonObject {
  return {
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    artist: card.artist,
    flavorText: card.flavorText,
    subtypes: card.subtypes,
    hp: card.hp,
    types: card.types,
    evolvesFrom: card.evolvesFrom,
    weaknesses: card.weaknesses,
    resistances: card.resistances,
    retreatCost: card.retreatCost,
    convertedRetreatCost: card.convertedRetreatCost,
    nationalPokedexNumbers: card.nationalPokedexNumbers,
    legalities: card.legalities,
    set: isJsonObject(card.set) ? card.set : undefined,
    images: isJsonObject(card.images) ? card.images : undefined,
    tcgplayer: isJsonObject(card.tcgplayer) ? card.tcgplayer : undefined,
  };
}

async function readCatalogMetadata(): Promise<CatalogMetadata> {
  const row = await dbGet<CatalogMetadataRow>(`
    SELECT
      COUNT(*) AS card_count,
      MAX(updated_at) AS latest_update,
      SUM(unixepoch(updated_at)) AS update_clock,
      SUM(length(raw_json)) AS content_size
    FROM cards
  `);
  const cardCount = Number(row?.card_count ?? 0);
  const latestUpdate = row?.latest_update ?? "empty";
  const updateClock = row?.update_clock ?? 0;
  const contentSize = row?.content_size ?? 0;
  return {
    cardCount,
    sourceVersion: `${cardCount}:${latestUpdate}:${updateClock}:${contentSize}`,
  };
}

async function readCatalogCards(expectedCardCount: number) {
  const cards: JsonObject[] = [];
  let lastRowId: number | bigint = 0;

  while (cards.length < expectedCardCount) {
    const rows: CatalogPageRow[] = await dbAll<CatalogPageRow>(
      `
      SELECT rowid AS row_id, raw_json
      FROM cards
      WHERE rowid > ?
      ORDER BY rowid
      LIMIT ?
      `,
      [lastRowId, CATALOG_PAGE_SIZE],
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      lastRowId = row.row_id;
      cards.push(toCatalogCard(parseStoredCard(String(row.raw_json))));
    }
  }

  if (cards.length !== expectedCardCount) {
    throw new Error(
      `Card catalog is incomplete: expected ${expectedCardCount}, received ${cards.length}`,
    );
  }
  return cards;
}

async function packageCatalog(
  cards: JsonObject[],
  sourceVersion: string,
): Promise<CatalogPayload> {
  const packagedAt = Date.now();
  const json = JSON.stringify({
    schemaVersion: CARD_CATALOG_SCHEMA_VERSION,
    generatedAt: new Date(packagedAt).toISOString(),
    sourceVersion,
    cardCount: cards.length,
    cards,
  });

  return {
    gzip: await gzipAsync(json),
    json,
  };
}

async function buildCatalog(): Promise<CatalogPayload> {
  const metadata = await readCatalogMetadata();
  if (metadata.cardCount <= 0) throw new Error("Card catalog is empty");

  const cards = await readCatalogCards(metadata.cardCount);
  const confirmedMetadata = await readCatalogMetadata();
  if (confirmedMetadata.sourceVersion !== metadata.sourceVersion) {
    throw new Error("Cards changed while the catalog was being generated");
  }

  return packageCatalog(cards, metadata.sourceVersion);
}

export function getCardCatalog(): Promise<CatalogPayload> {
  if (!pendingCatalog) {
    pendingCatalog = buildCatalog().finally(() => {
      pendingCatalog = null;
    });
  }
  return pendingCatalog;
}

export function acceptsGzip(header: string | undefined): boolean {
  return (header ?? "").split(",").some((entry) => {
    const [encoding, ...parameters] = entry.trim().split(";");
    if (encoding.toLowerCase() !== "gzip") return false;
    return !parameters.some((parameter) =>
      /^q=0(?:\.0*)?$/i.test(parameter.trim()),
    );
  });
}
