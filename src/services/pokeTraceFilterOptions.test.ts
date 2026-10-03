import { afterEach, beforeEach, expect, test, vi } from "vitest";

const payload = {
  schemaVersion: 2,
  generatedAt: "2026-09-26T08:00:00.000Z",
  rarities: ["Holo Rare", "Common"],
  setNames: ["Base Set 2", "Base Set"],
  setSummaries: [],
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
  });

  vi.resetModules();
  fetchMock.mockRejectedValue(new Error("network should not be used"));
  const secondLoad = await import("./pokeTraceFilterOptions");
  expect(await secondLoad.loadPokeTraceFilterOptions()).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();
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
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});
