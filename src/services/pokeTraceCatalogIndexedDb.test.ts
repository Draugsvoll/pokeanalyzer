import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogCard,
} from "../../shared/pokeTraceCatalog";

function catalogCard(id: string, name: string): PokeTraceCatalogCard {
  return {
    id,
    name,
    number: "004/102",
    rarity: "Holo Rare",
    setName: "Base Set",
    variant: "Unlimited Holofoil",
    currency: "USD",
    conditionPrices: { NEAR_MINT: 420, LIGHTLY_PLAYED: 350 },
    priceSnapshots: { "1d": 410, "7d": 400, "30d": 390 },
  };
}

function responsePayload(card: PokeTraceCatalogCard) {
  return {
    json: async () => ({
      schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
      generatedAt: new Date(Date.now()).toISOString(),
      cards: [card],
    }),
    ok: true,
  } as Response;
}

const search = {
  pokemonName: "char",
  setName: "",
  cardNumber: "",
};

describe("PokeTrace catalog IndexedDB lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_TEST_ENABLE_LOCAL_POKETRACE_CATALOG", "true");
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("stores a download and reuses it on the next app load", async () => {
    const now = Date.parse("2026-09-19T08:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePayload(catalogCard("card-1", "Charizard")));
    vi.stubGlobal("fetch", fetchMock);

    const firstLoad = await import("./pokeTraceCatalog");
    await firstLoad.initializePokeTraceCatalog();
    const firstResult = (
      await firstLoad.searchCachedPokeTraceCatalog(search)
    )?.[0];
    expect(firstResult?.id).toBe("card-1");
    expect(firstResult?.pokeTrace.prices).toEqual({
      tcgplayer: {
        LIGHTLY_PLAYED: { avg: 350 },
        NEAR_MINT: { avg: 420 },
      },
    });
    expect(await firstLoad.loadPokeTraceCatalogRarities()).toEqual([
      "Holo Rare",
    ]);
    expect(await firstLoad.loadPokeTraceCatalogSetNames()).toEqual([
      "Base Set",
    ]);

    vi.resetModules();
    fetchMock.mockRejectedValue(new Error("network should not be used"));
    const secondLoad = await import("./pokeTraceCatalog");
    const secondInitialization = secondLoad.initializePokeTraceCatalog();
    expect(
      (await secondLoad.searchCachedPokeTraceCatalog(search))?.[0]?.id,
    ).toBe("card-1");
    await secondInitialization;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("retries IndexedDB reads during the catalog refresh cooldown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const databaseFactory = globalThis.indexedDB;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePayload(catalogCard("card-1", "Charizard")));
    vi.stubGlobal("fetch", fetchMock);

    const firstLoad = await import("./pokeTraceCatalog");
    await firstLoad.initializePokeTraceCatalog();

    vi.resetModules();
    vi.spyOn(databaseFactory, "open").mockImplementationOnce(() => {
      throw new Error("temporary IndexedDB error");
    });
    const secondLoad = await import("./pokeTraceCatalog");
    await secondLoad.initializePokeTraceCatalog();

    expect(
      (await secondLoad.searchCachedPokeTraceCatalog(search))?.[0]?.id,
    ).toBe("card-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("expires the catalog after 12 hours and replaces it", async () => {
    const now = Date.parse("2026-09-19T08:00:00.000Z");
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responsePayload(catalogCard("card-1", "Charizard")));
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./pokeTraceCatalog");
    await service.initializePokeTraceCatalog();

    dateNow.mockReturnValue(now + service.POKETRACE_CATALOG_MAX_AGE_MS);
    fetchMock.mockResolvedValue(
      responsePayload(catalogCard("card-2", "Charizard ex")),
    );
    expect(await service.searchCachedPokeTraceCatalog(search)).toBeNull();
    await service.initializePokeTraceCatalog();

    expect((await service.searchCachedPokeTraceCatalog(search))?.[0]?.id).toBe(
      "card-2",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("rejects a stored catalog with an implausibly future timestamp", async () => {
    const now = Date.parse("2026-09-19T08:00:00.000Z");
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responsePayload(catalogCard("card-1", "Charizard")),
      )
      .mockResolvedValueOnce(
        responsePayload(catalogCard("card-2", "Charizard ex")),
      );
    vi.stubGlobal("fetch", fetchMock);

    const firstLoad = await import("./pokeTraceCatalog");
    await firstLoad.initializePokeTraceCatalog();

    dateNow.mockReturnValue(now - 24 * 60 * 60 * 1_000);
    vi.resetModules();
    const secondLoad = await import("./pokeTraceCatalog");
    expect(await secondLoad.searchCachedPokeTraceCatalog(search)).toBeNull();
    await secondLoad.initializePokeTraceCatalog();

    expect(
      (await secondLoad.searchCachedPokeTraceCatalog(search))?.[0]?.id,
    ).toBe("card-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not make search wait for a missing catalog download", async () => {
    let resolveDownload!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./pokeTraceCatalog");
    expect(await service.searchCachedPokeTraceCatalog(search)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveDownload(responsePayload(catalogCard("card-1", "Charizard")));
    await service.initializePokeTraceCatalog();
    expect((await service.searchCachedPokeTraceCatalog(search))?.[0]?.id).toBe(
      "card-1",
    );
  });

  test("uses no local catalog when IndexedDB is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "indexedDB");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./pokeTraceCatalog");
    await service.initializePokeTraceCatalog();

    expect(await service.searchCachedPokeTraceCatalog(search)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("skips download and local search when the browser catalog is disabled", async () => {
    vi.stubEnv("VITE_TEST_ENABLE_LOCAL_POKETRACE_CATALOG", "false");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./pokeTraceCatalog");
    await service.initializePokeTraceCatalog();

    expect(await service.searchCachedPokeTraceCatalog(search)).toBeNull();
    expect(await service.loadPokeTraceCatalogRarities()).toBeNull();
    expect(await service.loadPokeTraceCatalogSetNames()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("cannot enable the browser catalog outside the test runner", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_TEST_ENABLE_LOCAL_POKETRACE_CATALOG", "true");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./pokeTraceCatalog");
    await service.initializePokeTraceCatalog();

    expect(await service.searchCachedPokeTraceCatalog(search)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects malformed catalog cards instead of caching them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const malformedCard = {
      ...catalogCard("card-1", "Charizard"),
      number: 4,
    } as unknown as PokeTraceCatalogCard;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(responsePayload(malformedCard)),
    );

    const service = await import("./pokeTraceCatalog");
    await service.initializePokeTraceCatalog();

    expect(await service.searchCachedPokeTraceCatalog(search)).toBeNull();
  });
});
