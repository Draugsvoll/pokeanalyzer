import {
  GRADING_LIST_BROWSER_MISS_TTL_MS,
  GRADING_LIST_BROWSER_TTL_MS,
  isGradingOpportunityListFresh,
  parseGradingOpportunityList,
  type GradingOpportunityList,
} from "../../shared/gradingOpportunityList";
import { runWithRequestTimeout } from "../utils/requestTimeout";

const CACHE_KEY = "pokelyzer:grading-opportunities:poketrace-v2";
type CachedList = { cachedAt: number; payload: GradingOpportunityList | null };
let memory: CachedList | null = null;
let pending: Promise<GradingOpportunityList | null> | null = null;

function clearCache() {
  memory = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* Storage can be unavailable. */
  }
}

function readCache() {
  try {
    if (!memory) {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as CachedList;
        memory = {
          cachedAt: stored.cachedAt,
          payload:
            stored.payload === null
              ? null
              : parseGradingOpportunityList(stored.payload),
        };
      }
    }
  } catch {
    clearCache();
  }
  if (!memory) return undefined;
  const age = Date.now() - memory.cachedAt;
  const usable = memory.payload !== null;
  const fresh = usable && isGradingOpportunityListFresh(memory.payload!);
  const ttl = !usable
    ? GRADING_LIST_BROWSER_MISS_TTL_MS
    : fresh
      ? GRADING_LIST_BROWSER_TTL_MS
      : 0;
  return typeof memory.cachedAt === "number" &&
    Number.isFinite(age) &&
    age >= 0 &&
    age < ttl
    ? memory
    : undefined;
}

export function getGradingOpportunityList(): Promise<GradingOpportunityList | null> {
  const cached = readCache();
  if (cached) return Promise.resolve(cached.payload);
  pending ??= runWithRequestTimeout(async (signal) => {
    const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    const response = await fetch(
      `${apiUrl}/api/market-categories/grading-opportunities-list`,
      { cache: "no-store", signal },
    );
    if (!response.ok)
      throw new Error("Grading opportunity list is unavailable");
    const value: unknown = await response.json();
    const parsed = value === null ? null : parseGradingOpportunityList(value);
    const payload =
      parsed && isGradingOpportunityListFresh(parsed) ? parsed : null;
    memory = { cachedAt: Date.now(), payload };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
    } catch {
      /* Keep the in-memory cache. */
    }
    return payload;
  }).finally(() => {
    pending = null;
  });
  return pending;
}
