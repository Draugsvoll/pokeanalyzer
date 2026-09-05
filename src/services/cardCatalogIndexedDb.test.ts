import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PokemonCard } from "../types/pokemon";

function catalogCard(): PokemonCard {
  return {
    id: "base1-4",
    name: "Charizard",
    number: "4",
    set: {
      id: "base1",
      name: "Base",
      series: "Base",
      printedTotal: 102,
      total: 102,
      legalities: { unlimited: "Legal" },
      releaseDate: "1999/01/09",
      updatedAt: "2026/01/01",
      images: { symbol: "symbol.png", logo: "logo.png" },
    },
    images: { small: "small.png", large: "large.png" },
  };
}

function responsePayload(generatedAt: string) {
  return {
    ok: true,
    json: async () => ({
      schemaVersion: 1,
      generatedAt,
      sourceVersion: "test-version",
      cardCount: 1,
      cards: [catalogCard()],
    }),
  } as Response;
}

describe("card catalog IndexedDB lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("stores a validated download and reuses it on the next app load", async () => {
    const now = Date.parse("2026-09-05T12:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePayload(new Date(now).toISOString()));
    vi.stubGlobal("fetch", fetchMock);

    const firstLoad = await import("./cardCatalog");
    await firstLoad.initializeCardCatalog();
    expect(firstLoad.getAvailableCardCatalog()?.[0]?.id).toBe("base1-4");

    vi.resetModules();
    fetchMock.mockRejectedValue(new Error("network should not be used"));
    const secondLoad = await import("./cardCatalog");
    await secondLoad.initializeCardCatalog();
    expect(secondLoad.getAvailableCardCatalog()?.[0]?.id).toBe("base1-4");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("ignores stale data and uses no local catalog when refresh fails", async () => {
    const now = Date.parse("2026-09-05T12:00:00.000Z");
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePayload(new Date(now).toISOString()));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    const firstLoad = await import("./cardCatalog");
    await firstLoad.initializeCardCatalog();

    vi.resetModules();
    dateNow.mockReturnValue(now + firstLoad.CARD_CATALOG_MAX_AGE_MS);
    fetchMock.mockRejectedValue(new Error("network unavailable"));
    const staleLoad = await import("./cardCatalog");
    await staleLoad.initializeCardCatalog();
    expect(staleLoad.getAvailableCardCatalog()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  test("stops using an in-memory catalog at 24 hours and replaces it", async () => {
    const now = Date.parse("2026-09-05T12:00:00.000Z");
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePayload(new Date(now).toISOString()));
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./cardCatalog");
    await service.initializeCardCatalog();

    const refreshTime = now + service.CARD_CATALOG_MAX_AGE_MS;
    dateNow.mockReturnValue(refreshTime);
    expect(service.getAvailableCardCatalog()).toBeNull();

    fetchMock.mockResolvedValue(
      responsePayload(new Date(refreshTime).toISOString()),
    );
    await service.initializeCardCatalog();
    expect(service.getAvailableCardCatalog()?.[0]?.id).toBe("base1-4");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("keeps local search disabled for the session after a local failure", async () => {
    const now = Date.parse("2026-09-05T12:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePayload(new Date(now).toISOString()));
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./cardCatalog");
    await service.initializeCardCatalog();
    service.disableCardCatalogForSession();
    await service.initializeCardCatalog();

    expect(service.getAvailableCardCatalog()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("does not publish a catalog when IndexedDB is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "indexedDB");
    const now = Date.parse("2026-09-05T12:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePayload(new Date(now).toISOString()));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./cardCatalog");
    await service.initializeCardCatalog();
    expect(service.getAvailableCardCatalog()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
