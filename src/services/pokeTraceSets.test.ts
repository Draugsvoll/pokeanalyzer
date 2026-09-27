import { afterEach, expect, test, vi } from "vitest";
import { loadPokeTraceSetCards } from "./pokeTraceSets";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

test("requests the selected set every time", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    json: async () => ({ items: [card], total: 1 }),
    ok: true,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);

  expect(await loadPokeTraceSetCards("Base Set")).toEqual([card]);
  expect(await loadPokeTraceSetCards(" base SET ")).toEqual([card]);
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
      json: async () => ({ items: [card], total: 2 }),
      ok: true,
    } as Response),
  );

  await expect(loadPokeTraceSetCards("Base Set")).rejects.toThrow(
    "Set request returned an invalid response",
  );
});
