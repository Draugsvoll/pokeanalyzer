import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PokeTraceCatalogCard } from "../../shared/pokeTraceCatalog";

function catalogCard(id: string, name: string): PokeTraceCatalogCard {
  return {
    id,
    name,
    number: "004/102",
    setName: "Base Set",
    variant: "Unlimited Holofoil",
    currency: "USD",
    marketPrice: 420,
    priceSnapshots: { "1d": 410, "7d": 400, "30d": 390 },
  };
}

function responsePayload(card: PokeTraceCatalogCard) {
  return {
    json: async () => ({
      schemaVersion: 1,
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
    expect(firstLoad.searchCachedPokeTraceCatalog(search)?.[0]?.id).toBe(
      "card-1",
    );

    vi.resetModules();
    fetchMock.mockRejectedValue(new Error("network should not be used"));
    const secondLoad = await import("./pokeTraceCatalog");
    await secondLoad.initializePokeTraceCatalog();
    expect(secondLoad.searchCachedPokeTraceCatalog(search)?.[0]?.id).toBe(
      "card-1",
    );
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
    expect(service.searchCachedPokeTraceCatalog(search)).toBeNull();
    await service.initializePokeTraceCatalog();

    expect(service.searchCachedPokeTraceCatalog(search)?.[0]?.id).toBe(
      "card-2",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("uses no local catalog when IndexedDB is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "indexedDB");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./pokeTraceCatalog");
    await service.initializePokeTraceCatalog();

    expect(service.searchCachedPokeTraceCatalog(search)).toBeNull();
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

    expect(service.searchCachedPokeTraceCatalog(search)).toBeNull();
  });
});
