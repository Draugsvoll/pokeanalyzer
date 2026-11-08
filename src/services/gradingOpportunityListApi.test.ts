import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  GRADING_LIST_BROWSER_TTL_MS,
  GRADING_LIST_MAX_AGE_MS,
} from "../../shared/gradingOpportunityList";

const key = "pokelyzer:grading-opportunities:poketrace-v2";
const now = Date.parse("2026-11-06T12:00:00Z");
const snapshot = {
  schemaVersion: 2,
  generatedAt: new Date(now).toISOString(),
  items: [{ cardId: "one", psa10Price: 600 }],
};

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("deduplicates requests and uses the browser snapshot for six hours", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => snapshot });
  vi.stubGlobal("fetch", fetchMock);
  const { getGradingOpportunityList } =
    await import("./gradingOpportunityListApi");
  expect(
    await Promise.all([
      getGradingOpportunityList(),
      getGradingOpportunityList(),
    ]),
  ).toEqual([snapshot, snapshot]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.setSystemTime(now + GRADING_LIST_BROWSER_TTL_MS - 1);
  expect(await getGradingOpportunityList()).toEqual(snapshot);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.setSystemTime(now + GRADING_LIST_BROWSER_TTL_MS);
  await getGradingOpportunityList();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("reuses persisted storage after a reload without a request", async () => {
  localStorage.setItem(
    key,
    JSON.stringify({ cachedAt: now, payload: snapshot }),
  );
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { getGradingOpportunityList } =
    await import("./gradingOpportunityListApi");
  expect(await getGradingOpportunityList()).toEqual(snapshot);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("discards old seven-day snapshots instead of reusing their PSA prices", async () => {
  localStorage.setItem(
    key,
    JSON.stringify({
      cachedAt: now,
      payload: { ...snapshot, schemaVersion: 1 },
    }),
  );
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => snapshot });
  vi.stubGlobal("fetch", fetchMock);
  const { getGradingOpportunityList } =
    await import("./gradingOpportunityListApi");
  expect(await getGradingOpportunityList()).toEqual(snapshot);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem(key)!).payload.schemaVersion).toBe(2);
});

test("caches no-list responses across reloads and renews them after six hours", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => null })
    .mockResolvedValue({ ok: true, json: async () => snapshot });
  vi.stubGlobal("fetch", fetchMock);
  const first = await import("./gradingOpportunityListApi");
  expect(await first.getGradingOpportunityList()).toBeNull();
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
    cachedAt: now,
    payload: null,
  });
  expect(await first.getGradingOpportunityList()).toBeNull();
  vi.resetModules();
  const reloaded = await import("./gradingOpportunityListApi");
  vi.setSystemTime(now + GRADING_LIST_BROWSER_TTL_MS - 1);
  expect(await reloaded.getGradingOpportunityList()).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.setSystemTime(now + GRADING_LIST_BROWSER_TTL_MS);
  expect(await reloaded.getGradingOpportunityList()).toEqual(snapshot);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("48-hour expiry overrides a freshly written browser cache", async () => {
  const stale = {
    ...snapshot,
    generatedAt: new Date(now - GRADING_LIST_MAX_AGE_MS).toISOString(),
  };
  localStorage.setItem(key, JSON.stringify({ cachedAt: now, payload: stale }));
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => stale });
  vi.stubGlobal("fetch", fetchMock);
  const { getGradingOpportunityList } =
    await import("./gradingOpportunityListApi");
  expect(await getGradingOpportunityList()).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(key)).toBeNull();
});

test("failed and malformed requests are not cached; successful empty lists are cached", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...snapshot,
        items: [{ cardId: "bad", psa10Price: 0 }],
      }),
    })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ ...snapshot, items: [] }),
    });
  vi.stubGlobal("fetch", fetchMock);
  const { getGradingOpportunityList } =
    await import("./gradingOpportunityListApi");
  await expect(getGradingOpportunityList()).rejects.toThrow();
  await expect(getGradingOpportunityList()).rejects.toThrow();
  expect(await getGradingOpportunityList()).toEqual({ ...snapshot, items: [] });
  await getGradingOpportunityList();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("missing or future-dated snapshots are not usable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...snapshot,
        generatedAt: new Date(now + 1).toISOString(),
      }),
    }),
  );
  const { getGradingOpportunityList } =
    await import("./gradingOpportunityListApi");
  expect(await getGradingOpportunityList()).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();
});
