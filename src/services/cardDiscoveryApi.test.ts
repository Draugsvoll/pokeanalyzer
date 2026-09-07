import { afterEach, describe, expect, test, vi } from "vitest";
import {
  fetchMostExpensiveNewReleases,
  parseMostExpensiveNewReleases,
} from "./cardDiscoveryApi";

const card = {
  id: "new-1",
  name: "New Card",
  images: { small: "small.png" },
  set: {
    name: "New Set",
    releaseDate: "2026/08/01",
  },
};

describe("most expensive new releases response", () => {
  test("accepts displayable cards", () => {
    expect(parseMostExpensiveNewReleases({ cards: [card] })).toEqual([card]);
  });

  test("rejects malformed payloads", () => {
    expect(() => parseMostExpensiveNewReleases([])).toThrow();
    expect(() =>
      parseMostExpensiveNewReleases({ cards: [{ ...card, images: {} }] }),
    ).toThrow();
  });
});

function installBrowserStorage() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  vi.stubGlobal("window", { localStorage });
}

describe("most expensive new releases cache", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("reuses a successful response for 24 hours", async () => {
    installBrowserStorage();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ cards: [card] }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchMostExpensiveNewReleases()).toEqual([card]);
    expect(await fetchMostExpensiveNewReleases()).toEqual([card]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("refetches after the cached response is 24 hours old", async () => {
    installBrowserStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T00:00:00Z"));

    const newerCard = { ...card, id: "new-2", name: "Newer Card" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ cards: [card] }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({ cards: [newerCard] }),
        ok: true,
      });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchMostExpensiveNewReleases()).toEqual([card]);
    vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
    expect(await fetchMostExpensiveNewReleases()).toEqual([newerCard]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
