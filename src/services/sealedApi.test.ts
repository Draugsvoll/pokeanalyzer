import { afterEach, expect, test, vi } from "vitest";
import {
  fetchSealedFilterOptions,
  fetchSealedMarketPriceHistory,
  fetchSealedProduct,
  searchSealedProducts,
} from "./sealedApi";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "../utils/requestTimeout";

const product = {
  id: "019bff85-5452-714a-9660-a3559a2d5d95",
  name: "XY Booster Box",
  setName: "XY Base Set",
  productFamily: "booster_box",
  currency: "USD",
  price: 150,
  priceSnapshots: { "1d": 145, "7d": 125, "30d": null },
};
const details = {
  ...product,
  marketplaceUrls: {
    tcgplayer: "https://www.tcgplayer.com/product/123",
  },
  pricing: {
    tcgplayer: {
      price: 150,
      approxSaleCount: false,
      average1d: 150,
      average7d: 145,
      average30d: 140,
      high: 165,
      lastUpdated: "2026-10-05T00:00:00.000Z",
      low: 135,
      median3d: null,
      median7d: null,
      median30d: null,
      saleCount: 12,
    },
    ebay: {
      price: 142,
      approxSaleCount: false,
      average1d: 142,
      average7d: 140,
      average30d: 138,
      high: 155,
      lastUpdated: "2026-10-05T00:00:00.000Z",
      low: 130,
      median3d: null,
      median7d: null,
      median30d: null,
      saleCount: 8,
    },
  },
  refs: { cardmarketId: null, tcgplayerId: "123" },
} as const;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("times out stalled sealed requests", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    void url;
    void init;
    return new Promise<Response>(() => undefined);
  });
  vi.stubGlobal("fetch", fetchMock);

  const request = searchSealedProducts({
    name: "box",
    setName: "",
    productFamily: "",
  });
  const rejection = expect(request).rejects.toThrow(
    `Request timed out after ${DEFAULT_REQUEST_TIMEOUT_MS}ms`,
  );

  await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS);
  await rejection;

  const requestSignal = fetchMock.mock.calls[0]?.[1]?.signal;
  expect(requestSignal).toBeInstanceOf(AbortSignal);
  expect(requestSignal?.aborted).toBe(true);
});

test("searches the independent sealed endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ items: [product], total: 1 }),
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);

  const result = await searchSealedProducts({
    name: "box",
    setName: "",
    productFamily: "booster box",
    minPrice: 100,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/sealed/search?name=box&productFamily=booster+box&minPrice=100",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(result.items[0]).toEqual(product);
});

test("loads sealed set and product-type options", async () => {
  const options = {
    setNames: ["XY Base Set"],
    productFamilies: ["booster_box"],
  };
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => options,
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);

  expect(await fetchSealedFilterOptions()).toEqual(options);
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/sealed/filter-options",
    expect.objectContaining({ cache: "no-store" }),
  );
});

test("loads sealed details without using the card endpoint", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => details,
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);

  expect((await fetchSealedProduct(product.id)).id).toBe(product.id);
  expect(fetchMock).toHaveBeenCalledWith(
    `http://localhost:3001/api/sealed/${product.id}`,
    expect.objectContaining({ cache: "no-store" }),
  );
});

test("loads sealed graph data from the live unopened-history endpoint", async () => {
  const history = {
    productId: product.id,
    condition: "UNOPENED",
    period: "90d",
    currency: "USD",
    fetchedAt: "2026-10-05T12:00:00.000Z",
    stale: false,
    series: {
      tcgplayer: [
        {
          date: "2026-10-05",
          avg: 150,
          median7d: null,
          median30d: null,
          low: 145,
          high: 160,
          saleCount: 8,
          approxSaleCount: false,
        },
      ],
    },
  } as const;
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => history,
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);

  expect(await fetchSealedMarketPriceHistory(product.id)).toEqual(history);
  expect(fetchMock).toHaveBeenCalledWith(
    `http://localhost:3001/api/sealed/${product.id}/market-price-history`,
    expect.objectContaining({ cache: "no-store" }),
  );
});

test("rejects a sealed response with card-shaped pricing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => ({
        ...details,
        price: undefined,
        pokeTrace: { prices: { tcgplayer: { NEAR_MINT: { avg: 150 } } } },
      }),
      ok: true,
    }),
  );

  await expect(fetchSealedProduct(product.id)).rejects.toThrow(
    "Invalid sealed product response",
  );
});
