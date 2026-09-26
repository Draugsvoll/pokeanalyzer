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
// Keep the legacy browser-catalog lifecycle testable without allowing an
// application build to download or search it.
const LOCAL_CATALOG_ENABLED =
  import.meta.env.MODE === "test" &&
  import.meta.env.VITE_TEST_ENABLE_LOCAL_POKETRACE_CATALOG === "true";
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
let storedCatalogReadPromise: Promise<boolean> | null = null;
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

    let settled = false;
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
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error("Could not open IndexedDB"));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("IndexedDB upgrade was blocked"));
    };
  });
}

function isFresh(savedAt: number) {
  const now = Date.now();
  return (
    Number.isSafeInteger(savedAt) &&
    savedAt > 0 &&
    savedAt <= now &&
    now - savedAt < POKETRACE_CATALOG_MAX_AGE_MS
  );
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
      !Number.isSafeInteger(metadata.cardCount) ||
      metadata.cardCount <= 0 ||
      !Number.isSafeInteger(metadata.chunkCount) ||
      metadata.chunkCount <= 0 ||
      metadata.chunkCount !== Math.ceil(metadata.cardCount / CHUNK_SIZE) ||
      metadata.chunkCount !== chunks.length
    ) {
      return null;
    }

    chunks.sort((left, right) => left.index - right.index);
    if (
      chunks.some(
        (chunk, index) =>
          chunk.index !== index ||
          !Array.isArray(chunk.cards) ||
          chunk.cards.length !==
            Math.min(CHUNK_SIZE, metadata.cardCount - index * CHUNK_SIZE),
      )
    ) {
      return null;
    }
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

async function hydrateStoredCatalog() {
  const stored = await readStoredCatalog();
  if (stored) {
    setMemoryCatalog(stored.cards, stored.savedAt);
    retryAfter = 0;
    return true;
  }

  clearMemoryCatalog();
  return false;
}

async function downloadAndStoreCatalog() {
  const downloaded = await downloadCatalog();
  const savedAt = await storeCatalog(downloaded.cards);
  setMemoryCatalog(downloaded.cards, savedAt);
  retryAfter = 0;
}

export function initializePokeTraceCatalog() {
  if (!LOCAL_CATALOG_ENABLED) return Promise.resolve();
  if (indexedDbUnavailable || isFresh(memoryCatalogSavedAt)) {
    return Promise.resolve();
  }
  if (initializationPromise) return initializationPromise;

  if (typeof indexedDB === "undefined") {
    indexedDbUnavailable = true;
    return Promise.resolve();
  }

  const canRefreshCatalog = Date.now() >= retryAfter;
  storedCatalogReadPromise = hydrateStoredCatalog();
  initializationPromise = storedCatalogReadPromise
    .then(async (storedCatalogLoaded) => {
      if (!storedCatalogLoaded && canRefreshCatalog) {
        await downloadAndStoreCatalog();
      }
    })
    .catch((error: unknown) => {
      clearMemoryCatalog();
      retryAfter = Date.now() + RETRY_DELAY_MS;
      logClientError("PokeTrace browser catalog unavailable", error);
    })
    .finally(() => {
      initializationPromise = null;
      storedCatalogReadPromise = null;
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

export async function searchCachedPokeTraceCatalog(
  search: PokeTraceCatalogSearch,
): Promise<PokemonCard[] | null> {
  if (!LOCAL_CATALOG_ENABLED) return null;
  try {
    if (!memoryCatalog || !isFresh(memoryCatalogSavedAt)) {
      clearMemoryCatalog();
      void initializePokeTraceCatalog();

      const storedCatalogRead = storedCatalogReadPromise;
      if (!storedCatalogRead) return null;
      if (!(await storedCatalogRead)) return null;
    }

    if (!memoryCatalog || !isFresh(memoryCatalogSavedAt)) return null;
    return searchPokeTraceCatalogCards(memoryCatalog, search).map(
      toPokeTraceCatalogPokemonCard,
    );
  } catch (error) {
    clearMemoryCatalog();
    logClientError("PokeTrace browser catalog search unavailable", error);
    return null;
  }
}

export async function loadPokeTraceCatalogRarities() {
  if (!LOCAL_CATALOG_ENABLED) return null;
  await initializePokeTraceCatalog();
  return memoryCatalog ? [...memoryCatalogRarities] : null;
}

export async function loadPokeTraceCatalogSetNames() {
  if (!LOCAL_CATALOG_ENABLED) return null;
  await initializePokeTraceCatalog();
  return memoryCatalog ? [...memoryCatalogSetNames] : null;
}
