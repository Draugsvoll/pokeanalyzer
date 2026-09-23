import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogCard,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog";
import type { PokemonCard } from "../types/pokemon";
import { logClientError } from "../utils/logClientError";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const DATABASE_NAME = "pokelyzer-poketrace-catalog";
const DATABASE_VERSION = 1;
const METADATA_STORE = "metadata";
const CHUNK_STORE = "catalog_chunks";
const CATALOG_KEY = "poketrace-catalog";
const CHUNK_SIZE = 1_000;
export const POKETRACE_CATALOG_MAX_AGE_MS = 12 * 60 * 60 * 1_000;
const RETRY_DELAY_MS = 60 * 1_000;

type CatalogMetadata = {
  key: typeof CATALOG_KEY;
  savedAt: number;
  schemaVersion: number;
  cardCount: number;
  chunkCount: number;
};

type CatalogChunk = {
  index: number;
  cards: PokeTraceCatalogCard[];
};

let memoryCatalog: PokeTraceCatalogCard[] | null = null;
let memoryCatalogSavedAt = 0;
let initializationPromise: Promise<void> | null = null;
let indexedDbUnavailable = false;
let retryAfter = 0;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB failed"));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openCatalogDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(CHUNK_STORE)) {
        database.createObjectStore(CHUNK_STORE, { keyPath: "index" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open IndexedDB"));
    request.onblocked = () =>
      reject(new Error("IndexedDB upgrade was blocked"));
  });
}

function isFresh(savedAt: number) {
  return savedAt > 0 && Date.now() - savedAt < POKETRACE_CATALOG_MAX_AGE_MS;
}

function isNullablePrice(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isCatalogCard(value: unknown): value is PokeTraceCatalogCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Partial<PokeTraceCatalogCard>;
  const snapshots = card.priceSnapshots;
  return Boolean(
    typeof card.id === "string" &&
    card.id.trim() &&
    typeof card.name === "string" &&
    card.name.trim() &&
    typeof card.setName === "string" &&
    card.setName.trim() &&
    typeof card.currency === "string" &&
    card.currency.trim() &&
    isOptionalText(card.number) &&
    isOptionalText(card.rarity) &&
    isOptionalText(card.variant) &&
    isOptionalText(card.image) &&
    isNullablePrice(card.marketPrice) &&
    snapshots &&
    typeof snapshots === "object" &&
    !Array.isArray(snapshots) &&
    isNullablePrice(snapshots["1d"]) &&
    isNullablePrice(snapshots["7d"]) &&
    isNullablePrice(snapshots["30d"]),
  );
}

function parseCatalogResponse(value: unknown): PokeTraceCatalogResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid PokeTrace catalog response");
  }
  const response = value as Partial<PokeTraceCatalogResponse>;
  if (
    response.schemaVersion !== POKETRACE_CATALOG_SCHEMA_VERSION ||
    typeof response.generatedAt !== "string" ||
    !Array.isArray(response.cards) ||
    response.cards.length === 0 ||
    !response.cards.every(isCatalogCard)
  ) {
    throw new Error("Invalid PokeTrace catalog response");
  }
  return response as PokeTraceCatalogResponse;
}

async function readStoredCatalog() {
  const database = await openCatalogDatabase();
  try {
    const transaction = database.transaction(
      [METADATA_STORE, CHUNK_STORE],
      "readonly",
    );
    const metadataRequest = transaction
      .objectStore(METADATA_STORE)
      .get(CATALOG_KEY) as IDBRequest<CatalogMetadata | undefined>;
    const chunksRequest = transaction
      .objectStore(CHUNK_STORE)
      .getAll() as IDBRequest<CatalogChunk[]>;
    const [metadata, chunks] = await Promise.all([
      requestResult(metadataRequest),
      requestResult(chunksRequest),
      transactionComplete(transaction),
    ]);

    if (
      !metadata ||
      metadata.schemaVersion !== POKETRACE_CATALOG_SCHEMA_VERSION ||
      !isFresh(metadata.savedAt) ||
      metadata.chunkCount !== chunks.length
    ) {
      return null;
    }

    chunks.sort((left, right) => left.index - right.index);
    const cards = chunks.flatMap((chunk) => chunk.cards);
    if (cards.length !== metadata.cardCount || !cards.every(isCatalogCard)) {
      return null;
    }
    return { cards, savedAt: metadata.savedAt };
  } finally {
    database.close();
  }
}

async function storeCatalog(cards: PokeTraceCatalogCard[]) {
  const database = await openCatalogDatabase();
  try {
    const chunks: CatalogChunk[] = [];
    for (let index = 0; index < cards.length; index += CHUNK_SIZE) {
      chunks.push({
        index: chunks.length,
        cards: cards.slice(index, index + CHUNK_SIZE),
      });
    }

    const savedAt = Date.now();
    const transaction = database.transaction(
      [METADATA_STORE, CHUNK_STORE],
      "readwrite",
    );
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const chunkStore = transaction.objectStore(CHUNK_STORE);
    chunkStore.clear();
    for (const chunk of chunks) chunkStore.put(chunk);
    metadataStore.put({
      key: CATALOG_KEY,
      savedAt,
      schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
      cardCount: cards.length,
      chunkCount: chunks.length,
    } satisfies CatalogMetadata);
    await transactionComplete(transaction);
    return savedAt;
  } finally {
    database.close();
  }
}

async function downloadCatalog() {
  const response = await fetch(`${API_URL}/api/cards/catalog`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`PokeTrace catalog request failed: ${response.status}`);
  }
  return parseCatalogResponse(await response.json());
}

async function loadOrRefreshCatalog() {
  const stored = await readStoredCatalog();
  if (stored) {
    memoryCatalog = stored.cards;
    memoryCatalogSavedAt = stored.savedAt;
    return;
  }

  memoryCatalog = null;
  memoryCatalogSavedAt = 0;
  const downloaded = await downloadCatalog();
  const savedAt = await storeCatalog(downloaded.cards);
  memoryCatalog = downloaded.cards;
  memoryCatalogSavedAt = savedAt;
}

export function initializePokeTraceCatalog() {
  if (indexedDbUnavailable || isFresh(memoryCatalogSavedAt)) {
    return Promise.resolve();
  }
  if (initializationPromise) return initializationPromise;
  if (Date.now() < retryAfter) return Promise.resolve();

  if (typeof indexedDB === "undefined") {
    indexedDbUnavailable = true;
    return Promise.resolve();
  }

  initializationPromise = loadOrRefreshCatalog()
    .catch((error: unknown) => {
      memoryCatalog = null;
      memoryCatalogSavedAt = 0;
      retryAfter = Date.now() + RETRY_DELAY_MS;
      logClientError("PokeTrace browser catalog unavailable", error);
    })
    .finally(() => {
      initializationPromise = null;
    });
  return initializationPromise;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function unpaddedCardNumber(value: string) {
  const numerator = value.split("/", 1)[0]?.trim() ?? "";
  return /^\d+$/.test(numerator)
    ? numerator.replace(/^0+(?=\d)/, "")
    : numerator;
}

export type PokeTraceCatalogSearch = {
  pokemonName: string;
  setName: string;
  cardNumber: string;
};

export function searchPokeTraceCatalogCards(
  cards: PokeTraceCatalogCard[],
  search: PokeTraceCatalogSearch,
) {
  const pokemonName = normalized(search.pokemonName);
  const setName = normalized(search.setName);
  const cardNumber = normalized(search.cardNumber);

  const results: PokeTraceCatalogCard[] = [];
  for (const card of cards) {
    if (pokemonName && !normalized(card.name).includes(pokemonName)) continue;
    if (setName && !normalized(card.setName).includes(setName)) continue;
    if (cardNumber) {
      const storedNumber = normalized(card.number ?? "");
      if (
        storedNumber !== cardNumber &&
        unpaddedCardNumber(storedNumber) !== unpaddedCardNumber(cardNumber)
      ) {
        continue;
      }
    }
    results.push(card);
    if (results.length === 50) break;
  }
  return results;
}

function toPokemonCard(card: PokeTraceCatalogCard): PokemonCard {
  return {
    id: card.id,
    name: card.name,
    ...(card.number && { number: card.number }),
    ...(card.rarity && { rarity: card.rarity }),
    image: card.image,
    set: { id: "", name: card.setName },
    pokeTrace: {
      currency: card.currency,
      marketplaceUrls: {},
      prices:
        card.marketPrice == null
          ? {}
          : { tcgplayer: { NEAR_MINT: { avg: card.marketPrice } } },
      ...(card.variant && { variant: card.variant }),
    },
  };
}

export function searchCachedPokeTraceCatalog(
  search: PokeTraceCatalogSearch,
): PokemonCard[] | null {
  if (!memoryCatalog || !isFresh(memoryCatalogSavedAt)) {
    memoryCatalog = null;
    memoryCatalogSavedAt = 0;
    void initializePokeTraceCatalog();
    return null;
  }
  return searchPokeTraceCatalogCards(memoryCatalog, search).map(toPokemonCard);
}
