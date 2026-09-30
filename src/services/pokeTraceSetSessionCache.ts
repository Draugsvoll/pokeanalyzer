import { isLoadedPokeTraceSet, type LoadedPokeTraceSet } from "./pokeTraceSets";

const CACHE_KEY = "pokeanalyzer:set-explorer:last-set";
const CACHE_VERSION = 1;
export const POKETRACE_SET_SESSION_CACHE_TTL_MS = 30 * 60 * 1000;

type CachedPokeTraceSet = {
  data: LoadedPokeTraceSet;
  savedAt: number;
  setName: string;
  version: typeof CACHE_VERSION;
};

function sessionStorageOrNull() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function removeCachedValue(storage: Storage) {
  try {
    storage.removeItem(CACHE_KEY);
  } catch {
    // Ignore unavailable storage; fetching remains the fallback.
  }
}

export function loadPokeTraceSetFromSession(
  setName: string,
  now = Date.now(),
): LoadedPokeTraceSet | null {
  const storage = sessionStorageOrNull();
  if (!storage) return null;

  try {
    const stored = storage.getItem(CACHE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      removeCachedValue(storage);
      return null;
    }

    const cached = parsed as Partial<CachedPokeTraceSet>;
    if (
      cached.version !== CACHE_VERSION ||
      typeof cached.setName !== "string" ||
      typeof cached.savedAt !== "number" ||
      !Number.isFinite(cached.savedAt) ||
      cached.savedAt > now ||
      now - cached.savedAt > POKETRACE_SET_SESSION_CACHE_TTL_MS ||
      !isLoadedPokeTraceSet(cached.data, cached.setName)
    ) {
      removeCachedValue(storage);
      return null;
    }

    return cached.setName.localeCompare(setName, "en-US", {
      sensitivity: "base",
    }) === 0
      ? cached.data
      : null;
  } catch {
    removeCachedValue(storage);
    return null;
  }
}

export function savePokeTraceSetToSession(
  setName: string,
  data: LoadedPokeTraceSet,
  now = Date.now(),
) {
  const storage = sessionStorageOrNull();
  if (!storage || !isLoadedPokeTraceSet(data, setName)) return;

  const cached: CachedPokeTraceSet = {
    data,
    savedAt: now,
    setName,
    version: CACHE_VERSION,
  };
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Storage may be unavailable or the set payload may exceed its quota.
  }
}
