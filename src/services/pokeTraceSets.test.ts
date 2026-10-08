import { afterEach, expect, test, vi } from "vitest";
import { loadPokeTraceSet } from "./pokeTraceSets";

const card = {
  id: "card-1",
  name: "Alakazam",
  number: "1/102",
  set: { id: "", name: "Base Set" },
  pokeTrace: {
    currency: "USD",
    marketplaceUrls: {},
    prices: { tcgplayer: { NEAR_MINT: { avg: 30 } } },
  },
};

const salesLeaders = {
  total: { cardId: "card-1" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("requests the selected set every time", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    json: async () => ({ items: [card], salesLeaders, total: 1 }),
    ok: true,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);

  expect(await loadPokeTraceSet("Base Set")).toEqual({
    cards: [card],
    salesLeaders,
  });
  expect(await loadPokeTraceSet(" base SET ")).toEqual({
    cards: [card],
    salesLeaders,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "http://localhost:3001/api/cards/set?setName=Base+Set",
    { signal: expect.any(AbortSignal) },
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "http://localhost:3001/api/cards/set?setName=base+SET",
    { signal: expect.any(AbortSignal) },
  );
});

test("rejects a response whose total does not match its items", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue({
      json: async () => ({ items: [card], salesLeaders, total: 2 }),
      ok: true,
    } as Response),
  );

  await expect(loadPokeTraceSet("Base Set")).rejects.toThrow(
    "Set request returned an invalid response",
  );
});

test("rejects malformed set sales leaders", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue({
      json: async () => ({
        items: [card],
        salesLeaders: {
          ...salesLeaders,
          total: { cardId: "" },
        },
        total: 1,
      }),
      ok: true,
    } as Response),
  );

  await expect(loadPokeTraceSet("Base Set")).rejects.toThrow(
    "Set request returned an invalid response",
  );
});

test("keeps set browsing available during a backend rollout without insights", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue({
      json: async () => ({ items: [card], total: 1 }),
      ok: true,
    } as Response),
  );

  await expect(loadPokeTraceSet("Base Set")).resolves.toEqual({
    cards: [card],
    salesLeaders: { total: null },
  });
});
