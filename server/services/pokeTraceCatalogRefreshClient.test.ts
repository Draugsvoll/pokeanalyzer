import assert from "node:assert/strict";
import test from "node:test";
import {
  requestPokeTraceCatalogRefresh,
  requestPokeTraceSealedCatalogRefresh,
} from "./pokeTraceCatalogRefreshClient.js";

test("catalog refresh request sends one authenticated POST", async () => {
  let requests = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    requests += 1;
    assert.equal(
      String(input),
      "https://backend.test/api/cards/catalog/refresh",
    );
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, {
      Authorization: "Bearer catalog-refresh-secret",
    });
    assert.equal(init?.redirect, "error");
    return new Response(null, { status: 204 });
  };

  await requestPokeTraceCatalogRefresh({
    endpoint: "https://backend.test/api/cards/catalog/refresh",
    fetchImpl,
    token: "catalog-refresh-secret",
  });
  assert.equal(requests, 1);
});

test("sealed catalog refresh request sends one authenticated POST", async () => {
  let requests = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    requests += 1;
    assert.equal(
      String(input),
      "https://backend.test/api/sealed/catalog/refresh",
    );
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, {
      Authorization: "Bearer catalog-refresh-secret",
    });
    return new Response(null, { status: 204 });
  };

  await requestPokeTraceSealedCatalogRefresh({
    endpoint: "https://backend.test/api/sealed/catalog/refresh",
    fetchImpl,
    token: "catalog-refresh-secret",
  });
  assert.equal(requests, 1);
});

test("catalog refresh request rejects missing configuration", async () => {
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests += 1;
    return new Response(null, { status: 204 });
  };

  await assert.rejects(
    requestPokeTraceCatalogRefresh({
      endpoint: "",
      fetchImpl,
      token: "",
    }),
    /Catalogue warmup failed: .*must be configured together/,
  );
  assert.equal(requests, 0);
});

test("catalog refresh request rejects unsuccessful responses", async () => {
  await assert.rejects(
    requestPokeTraceCatalogRefresh({
      endpoint: "https://backend.test/api/cards/catalog/refresh",
      fetchImpl: async () => new Response(null, { status: 500 }),
      token: "catalog-refresh-secret",
    }),
    /Catalogue warmup failed: .*HTTP 500/,
  );
});

test("catalog refresh request identifies network failures as warmup failures", async () => {
  await assert.rejects(
    requestPokeTraceCatalogRefresh({
      endpoint: "https://backend.test/api/cards/catalog/refresh",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
      token: "catalog-refresh-secret",
    }),
    /Catalogue warmup failed: fetch failed/,
  );
});
