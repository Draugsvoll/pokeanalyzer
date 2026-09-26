import {
  isPokeTraceCatalogCard,
  parsePokeTraceCatalogResponse,
  POKETRACE_CATALOG_SCHEMA_VERSION,
  toPokeTraceCatalogPokemonCard,
  type PokeTraceCatalogCard,
} from "../../shared/pokeTraceCatalog";
import { POKETRACE_SEARCH_RESULT_LIMIT } from "../../shared/pokeTraceSearch";
import {
  searchPokeTraceCatalogCards as searchCatalogCards,
  type PokeTraceCatalogSearch,
} from "../../shared/pokeTraceCatalogSearch";
import type { PokemonCard } from "../types/pokemon";
import { logClientError } from "../utils/logClientError";

export type { PokeTraceCatalogSearch };

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
let memoryCatalogRarities: string[] = [];
let memoryCatalogSetNames: string[] = [];
let initializationPromise: Promise<void> | null = null;
let indexedDbUnavailable = false;
let retryAfter = 0;

function collectCatalogRarities(cards: PokeTraceCatalogCard[]) {
  const rarities = new Map<string, string>();
  for (const card of cards) {
    const rarity = card.rarity?.trim();
    if (rarity) rarities.set(rarity.toLocaleLowerCase("en-US"), rarity);
  }
  return [...rarities.values()].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

function collectCatalogSetNames(cards: PokeTraceCatalogCard[]) {
  const setNames = new Map<string, string>();
  for (const card of cards) {
    const setName = card.setName.trim();
    if (setName) setNames.set(setName.toLocaleLowerCase("en-US"), setName);
  }
  return [...setNames.values()].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
}

function setMemoryCatalog(cards: PokeTraceCatalogCard[], savedAt: number) {
  memoryCatalog = cards;
  memoryCatalogSavedAt = savedAt;
  memoryCatalogRarities = collectCatalogRarities(cards);
  memoryCatalogSetNames = collectCatalogSetNames(cards);
}

function clearMemoryCatalog() {
  memoryCatalog = null;
  memoryCatalogSavedAt = 0;
  memoryCatalogRarities = [];
  memoryCatalogSetNames = [];
}

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
    if (
      cards.length !== metadata.cardCount ||
      !cards.every(isPokeTraceCatalogCard)
    ) {
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
  return parsePokeTraceCatalogResponse(await response.json());
}

async function loadOrRefreshCatalog() {
  const stored = await readStoredCatalog();
  if (stored) {
    setMemoryCatalog(stored.cards, stored.savedAt);
    return;
  }

  clearMemoryCatalog();
  const downloaded = await downloadCatalog();
  const savedAt = await storeCatalog(downloaded.cards);
  setMemoryCatalog(downloaded.cards, savedAt);
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
      clearMemoryCatalog();
      retryAfter = Date.now() + RETRY_DELAY_MS;
      logClientError("PokeTrace browser catalog unavailable", error);
    })
    .finally(() => {
      initializationPromise = null;
    });
  return initializationPromise;
}

export function searchPokeTraceCatalogCards(
  cards: PokeTraceCatalogCard[],
  search: PokeTraceCatalogSearch,
) {
  return searchCatalogCards(cards, search, {
    limit: POKETRACE_SEARCH_RESULT_LIMIT,
  });
}

export function searchCachedPokeTraceCatalog(
  search: PokeTraceCatalogSearch,
): PokemonCard[] | null {
  if (!memoryCatalog || !isFresh(memoryCatalogSavedAt)) {
    clearMemoryCatalog();
    void initializePokeTraceCatalog();
    return null;
  }
  return searchPokeTraceCatalogCards(memoryCatalog, search).map(
    toPokeTraceCatalogPokemonCard,
  );
}

export async function loadPokeTraceCatalogRarities() {
  await initializePokeTraceCatalog();
  return memoryCatalog ? [...memoryCatalogRarities] : null;
}

export async function loadPokeTraceCatalogSetNames() {
  await initializePokeTraceCatalog();
  return memoryCatalog ? [...memoryCatalogSetNames] : null;
}
