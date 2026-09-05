import type { PokemonCard } from "../types/pokemon";
import { logClientError } from "../utils/logClientError";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const DATABASE_NAME = "pokeanalyzer-card-catalog";
const DATABASE_VERSION = 1;
const STORE_NAME = "catalogs";
const CATALOG_KEY = "active";
const SCHEMA_VERSION = 1;
const REFRESH_RETRY_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const CARD_CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CardCatalog = {
  key: typeof CATALOG_KEY;
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  sourceVersion: string;
  cardCount: number;
  cards: PokemonCard[];
};

export type CardCatalogSearch = {
  pokemonName: string;
  setName: string;
  setSeries: string;
  cardNumber: string;
};

let availableCatalog: CardCatalog | null = null;
let initialization: Promise<void> | null = null;
let nextRefreshAttemptAt = 0;
let disabledForSession = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): boolean {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isTypeEffects(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.type === "string" &&
          typeof entry.value === "string",
      ))
  );
}

function isLegalities(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isValidSet(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.series === "string" &&
    typeof value.printedTotal === "number" &&
    typeof value.total === "number" &&
    isLegalities(value.legalities) &&
    isOptionalString(value.ptcgoCode) &&
    typeof value.releaseDate === "string" &&
    typeof value.updatedAt === "string" &&
    isRecord(value.images) &&
    typeof value.images.symbol === "string" &&
    typeof value.images.logo === "string"
  );
}

function isValidTcgplayer(value: unknown): boolean {
  if (value === undefined) return true;
  if (
    !isRecord(value) ||
    !isOptionalString(value.url) ||
    !isOptionalString(value.updatedAt)
  ) {
    return false;
  }

  if (value.prices === undefined) return true;
  if (!isRecord(value.prices)) return false;

  const isOptionalPrice = (price: unknown) =>
    price === undefined ||
    price === null ||
    (typeof price === "number" && Number.isFinite(price));

  return Object.values(value.prices).every(
    (price) =>
      isRecord(price) &&
      isOptionalPrice(price.low) &&
      isOptionalPrice(price.mid) &&
      isOptionalPrice(price.high) &&
      isOptionalPrice(price.market) &&
      isOptionalPrice(price.directLow),
  );
}

function isValidCatalogCard(value: unknown): value is PokemonCard {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isOptionalString(value.number) &&
    isOptionalString(value.rarity) &&
    isOptionalString(value.artist) &&
    isOptionalString(value.flavorText) &&
    isOptionalString(value.hp) &&
    isOptionalString(value.evolvesFrom) &&
    isOptionalStringArray(value.subtypes) &&
    isOptionalStringArray(value.types) &&
    isTypeEffects(value.weaknesses) &&
    isTypeEffects(value.resistances) &&
    isOptionalStringArray(value.retreatCost) &&
    (value.convertedRetreatCost === undefined ||
      typeof value.convertedRetreatCost === "number") &&
    (value.nationalPokedexNumbers === undefined ||
      (Array.isArray(value.nationalPokedexNumbers) &&
        value.nationalPokedexNumbers.every(
          (number) => typeof number === "number",
        ))) &&
    (value.legalities === undefined || isLegalities(value.legalities)) &&
    value.cardmarket === undefined &&
    value.justtcg === undefined &&
    value.grok === undefined &&
    value.justtcgLookup === undefined &&
    isValidSet(value.set) &&
    isRecord(value.images) &&
    typeof value.images.small === "string" &&
    typeof value.images.large === "string" &&
    isValidTcgplayer(value.tcgplayer)
  );
}

export function parseCardCatalog(value: unknown): CardCatalog | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    typeof value.generatedAt !== "string" ||
    typeof value.sourceVersion !== "string" ||
    typeof value.cardCount !== "number" ||
    !Number.isSafeInteger(value.cardCount) ||
    value.cardCount <= 0 ||
    !Array.isArray(value.cards) ||
    value.cards.length !== value.cardCount
  ) {
    return null;
  }

  const ids = new Set<string>();
  for (const card of value.cards) {
    if (!isValidCatalogCard(card) || ids.has(card.id)) return null;
    ids.add(card.id);
  }

  return {
    key: CATALOG_KEY,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: value.generatedAt,
    sourceVersion: value.sourceVersion,
    cardCount: value.cardCount,
    cards: value.cards,
  };
}

export function isCardCatalogFresh(
  catalog: Pick<CardCatalog, "generatedAt">,
  now = Date.now(),
): boolean {
  const generatedAt = Date.parse(catalog.generatedAt);
  return (
    Number.isFinite(generatedAt) &&
    generatedAt <= now + CLOCK_SKEW_MS &&
    now - generatedAt < CARD_CATALOG_MAX_AGE_MS
  );
}

function openCatalogDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readStoredCatalog(): Promise<CardCatalog | null> {
  const database = await openCatalogDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CATALOG_KEY);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
      request.onsuccess = () => resolve(parseCardCatalog(request.result));
    });
  } finally {
    database.close();
  }
}

async function storeCatalog(catalog: CardCatalog): Promise<void> {
  const database = await openCatalogDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(catalog);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function downloadCatalog(): Promise<CardCatalog> {
  const response = await fetch(`${API_URL}/api/cards/catalog`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Card catalog request failed: ${response.status}`);
  }

  const catalog = parseCardCatalog(await response.json());
  if (!catalog || !isCardCatalogFresh(catalog)) {
    throw new Error("Card catalog response is invalid or stale");
  }
  return catalog;
}

async function initialize(): Promise<void> {
  let stored: CardCatalog | null;
  try {
    stored = await readStoredCatalog();
  } catch (error) {
    logClientError("Failed to read the local card catalog", error);
    return;
  }

  if (stored && isCardCatalogFresh(stored)) {
    availableCatalog = stored;
    return;
  }

  try {
    const downloaded = await downloadCatalog();
    await storeCatalog(downloaded);
    availableCatalog = downloaded;
    nextRefreshAttemptAt = 0;
  } catch (error) {
    availableCatalog = null;
    logClientError("Failed to refresh the local card catalog", error);
  }
}

export function initializeCardCatalog(): Promise<void> {
  if (disabledForSession || getAvailableCardCatalog()) return Promise.resolve();
  if (initialization) return initialization;
  if (Date.now() < nextRefreshAttemptAt) return Promise.resolve();

  nextRefreshAttemptAt = Date.now() + REFRESH_RETRY_MS;
  initialization = initialize().finally(() => {
    initialization = null;
  });
  return initialization;
}

export function getAvailableCardCatalog(): PokemonCard[] | null {
  if (
    disabledForSession ||
    !availableCatalog ||
    !isCardCatalogFresh(availableCatalog)
  ) {
    return null;
  }
  return availableCatalog.cards;
}

export function disableCardCatalogForSession(): void {
  disabledForSession = true;
  availableCatalog = null;
}

function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileSqliteLike(query: string): (value: string) => boolean {
  const pattern = Array.from(asciiLower(query.trim()))
    .map((character) => {
      if (character === "%") return ".*";
      if (character === "_") return ".";
      return escapeRegularExpression(character);
    })
    .join("");
  const expression = new RegExp(pattern, "su");
  return (value) => expression.test(asciiLower(value));
}

function exactNoCase(value: string | undefined, query: string): boolean {
  return typeof value === "string" && asciiLower(value) === asciiLower(query);
}

export function searchCardCatalog(
  cards: PokemonCard[],
  query: CardCatalogSearch,
): PokemonCard[] {
  const pokemonName = query.pokemonName.trim();
  const setName = query.setName.trim();
  const setSeries = query.setSeries.trim();
  const cardNumber = query.cardNumber.trim();
  const nameMatches = compileSqliteLike(pokemonName);
  const setMatches = compileSqliteLike(setName);
  const seriesMatches = compileSqliteLike(setSeries);
  const results: PokemonCard[] = [];

  for (const card of cards) {
    if (pokemonName && !nameMatches(card.name)) continue;
    if (setName && !setMatches(card.set.name)) continue;
    if (setSeries && !seriesMatches(card.set.series)) continue;
    if (cardNumber && !exactNoCase(card.number, cardNumber)) continue;

    results.push(card);
    if (results.length === 50) break;
  }
  return results;
}
