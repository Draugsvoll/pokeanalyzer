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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("reuses validated filter options from local storage for six hours regardless of the server generation date", async () => {
  const now = Date.parse("2026-09-30T09:00:00.000Z");
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

  vi.spyOn(Date, "now").mockReturnValue(now + 6 * 60 * 60 * 1_000 - 1);
  vi.resetModules();
  fetchMock.mockRejectedValue(new Error("network should not be used"));
  const secondLoad = await import("./pokeTraceFilterOptions");
  expect(await secondLoad.loadPokeTraceFilterOptions()).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/filter-options?v=2",
    { cache: "no-store", signal: expect.any(AbortSignal) },
  );
});

test("refreshes a current cache when its payload is invalid", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const now = Date.parse("2026-09-26T09:00:00.000Z");
  localStorage.setItem(
    "pokelyzer:poketrace-filter-options:v2",
    JSON.stringify({
      cachedAt: now - 60_000,
      options: {
        ...payload,
        setSummaries: [
          { ...payload.setSummaries[0], sevenDayChangePercent: "invalid" },
        ],
      },
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

test("fetches again at six hours even when the server returns the same summaries", async () => {
  const now = Date.parse("2026-09-30T08:00:00.000Z");
  localStorage.setItem(
    "pokelyzer:poketrace-filter-options:v2",
    JSON.stringify({
      cachedAt: now - 6 * 60 * 60 * 1_000,
      options: payload,
    }),
  );
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    json: async () => payload,
    ok: true,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  const service = await import("./pokeTraceFilterOptions");
  const options = await service.loadPokeTraceFilterOptions();
  expect(options?.generatedAt).toBe(payload.generatedAt);
  expect(options?.setSummaries).toHaveLength(2);
  await service.loadPokeTraceFilterOptions();
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("invalid newly fetched percentages hide cached summaries and allow retry", async () => {
  const now = Date.parse("2026-09-30T08:00:00.000Z");
  localStorage.setItem(
    "pokelyzer:poketrace-filter-options:v2",
    JSON.stringify({
      cachedAt: now - 6 * 60 * 60 * 1_000,
      options: payload,
    }),
  );
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...payload,
        setSummaries: [
          { ...payload.setSummaries[0], sevenDayChangePercent: "invalid" },
        ],
      }),
    } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => payload } as Response);
  vi.stubGlobal("fetch", fetchMock);
  const service = await import("./pokeTraceFilterOptions");
  expect((await service.loadPokeTraceFilterOptions())?.setSummaries).toEqual(
    [],
  );
  expect(
    (await service.loadPokeTraceFilterOptions())?.setSummaries,
  ).toHaveLength(2);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("missing percentages in a valid new response replace cached percentages", async () => {
  const now = Date.parse("2026-09-30T08:00:00.000Z");
  localStorage.setItem(
    "pokelyzer:poketrace-filter-options:v2",
    JSON.stringify({ cachedAt: now - 6 * 60 * 60 * 1_000, options: payload }),
  );
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ ...payload, setSummaries: [] }),
    } as Response);
  vi.stubGlobal("fetch", fetchMock);
  const service = await import("./pokeTraceFilterOptions");
  expect((await service.loadPokeTraceFilterOptions())?.setSummaries).toEqual(
    [],
  );
  expect((await service.loadPokeTraceFilterOptions())?.setSummaries).toEqual(
    [],
  );
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("retains directory options but omits summaries when a refresh fails", async () => {
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
    setSummaries: [],
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test.each(["fetch", "body"])(
  "times out a stalled %s, allows retry, and ignores late data",
  async (stage) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T09:00:00.000Z"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let resolveLate!: () => void;
    const fetchMock = vi.fn<typeof fetch>().mockImplementationOnce(() => {
      if (stage === "fetch")
        return new Promise<Response>((resolve) => {
          resolveLate = () =>
            resolve({ ok: true, json: async () => payload } as Response);
        });
      return Promise.resolve({
        ok: true,
        json: () =>
          new Promise((resolve) => {
            resolveLate = () => resolve(payload);
          }),
      } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = await import("./pokeTraceFilterOptions");
    const pending = service.loadPokeTraceFilterOptions();
    const concurrent = service.loadPokeTraceFilterOptions();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    expect(await concurrent).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    const refreshed = { ...payload, generatedAt: "2026-09-26T09:00:10.000Z" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => refreshed,
    } as Response);
    expect((await service.loadPokeTraceFilterOptions())?.generatedAt).toBe(
      refreshed.generatedAt,
    );
    resolveLate();
    await vi.advanceTimersByTimeAsync(0);
    expect((await service.loadPokeTraceFilterOptions())?.generatedAt).toBe(
      refreshed.generatedAt,
    );
    expect(
      JSON.parse(localStorage.getItem("pokelyzer:poketrace-filter-options:v2")!)
        .options.generatedAt,
    ).toBe(refreshed.generatedAt);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  },
);
