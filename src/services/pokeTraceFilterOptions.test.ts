import { afterEach, beforeEach, expect, test, vi } from "vitest";

const payload = {
  schemaVersion: 2,
  generatedAt: "2026-09-26T08:00:00.000Z",
  rarities: ["Holo Rare", "Common"],
  setNames: ["Base Set 2", "Base Set"],
  setSummaries: [
    {
      asOf: "2026-09-26T08:00:00.000Z",
      comparableCards: 1,
      currency: "USD",
      pricedCards: 1,
      setName: "Base Set 2",
      sevenDayChangePercent: 2,
      uniqueCards: 1,
    },
    {
      asOf: "2026-09-26T08:00:00.000Z",
      comparableCards: 1,
      currency: "USD",
      pricedCards: 1,
      setName: "Base Set",
      sevenDayChangePercent: -1,
      uniqueCards: 1,
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("reuses validated filter options from local storage for one day", async () => {
  const now = Date.parse("2026-09-26T09:00:00.000Z");
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    json: async () => payload,
    ok: true,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);

  const firstLoad = await import("./pokeTraceFilterOptions");
  expect(await firstLoad.loadPokeTraceFilterOptions()).toEqual({
    ...payload,
    rarities: ["Common", "Holo Rare"],
    setNames: ["Base Set", "Base Set 2"],
    setSummaries: [...payload.setSummaries].reverse(),
  });

  vi.resetModules();
  fetchMock.mockRejectedValue(new Error("network should not be used"));
  const secondLoad = await import("./pokeTraceFilterOptions");
  expect(await secondLoad.loadPokeTraceFilterOptions()).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/filter-options?v=2",
    { cache: "no-store" },
  );
});

test("refreshes a current cache when its set summaries cannot be displayed", async () => {
  const now = Date.parse("2026-09-26T09:00:00.000Z");
  localStorage.setItem(
    "pokelyzer:poketrace-filter-options:v2",
    JSON.stringify({
      cachedAt: now - 60_000,
      options: { ...payload, setSummaries: [] },
    }),
  );
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    json: async () => payload,
    ok: true,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);

  const service = await import("./pokeTraceFilterOptions");
  await service.loadPokeTraceFilterOptions();

  expect(fetchMock).toHaveBeenCalledOnce();
});

test("refreshes a current cache when its set summaries have expired", async () => {
  const now = Date.parse("2026-09-28T08:00:01.000Z");
  localStorage.setItem(
    "pokelyzer:poketrace-filter-options:v2",
    JSON.stringify({
      cachedAt: now - 60_000,
      options: payload,
    }),
  );
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    json: async () => ({
      ...payload,
      generatedAt: new Date(now).toISOString(),
      setSummaries: payload.setSummaries.map((summary) => ({
        ...summary,
        asOf: new Date(now).toISOString(),
      })),
    }),
    ok: true,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);

  const service = await import("./pokeTraceFilterOptions");
  const options = await service.loadPokeTraceFilterOptions();

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(options?.generatedAt).toBe(new Date(now).toISOString());
});

test("refreshes an expired cache and retains stale options on failure", async () => {
  const now = Date.parse("2026-09-26T09:00:00.000Z");
  localStorage.setItem(
    "pokelyzer:poketrace-filter-options:v2",
    JSON.stringify({
      cachedAt: now - 2 * 24 * 60 * 60 * 1_000,
      options: payload,
    }),
  );
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("temporary network failure"));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  const service = await import("./pokeTraceFilterOptions");
  expect(await service.loadPokeTraceFilterOptions()).toEqual({
    ...payload,
    rarities: ["Common", "Holo Rare"],
    setNames: ["Base Set", "Base Set 2"],
    setSummaries: [...payload.setSummaries].reverse(),
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});
