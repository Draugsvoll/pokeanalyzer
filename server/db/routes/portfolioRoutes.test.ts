import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  addPortfolioAsset,
  createHydratedAssetsHandler,
  createHydratedPortfolioHandler,
  createPortfolioAssetHandlers,
  getHydratedAssets,
  parseAssetEntry,
  removePortfolioAsset,
  updatePortfolioAssetQuantity,
} from "./portfolioRoutes.js";
import { requestFromTestServer } from "./httpTestServer.js";

const pokeTraceCardId = "019bff77-befa-771d-bab0-f5909f0a78c9";

test("GET hydrated portfolio returns PokeTrace cards with price snapshots", async () => {
  const app = express();
  app.get(
    "/api/portfolio/cards/hydrated",
    createHydratedPortfolioHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => [{ cardId: pokeTraceCardId, quantity: 2 }],
      loadHydratedCards: async () => ({
        cards: [
          {
            id: pokeTraceCardId,
            quantity: 2,
            priceSnapshots: {
              "1d": {
                recordedAt: "2026-09-16",
                marketPrice: 410,
                sourceUpdatedAt: "2026-09-16T08:00:00.000Z",
              },
            },
          },
        ],
        missingCardIds: [],
      }),
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/portfolio/cards/hydrated",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    cards: [
      {
        id: pokeTraceCardId,
        quantity: 2,
        priceSnapshots: {
          "1d": {
            recordedAt: "2026-09-16",
            marketPrice: 410,
            sourceUpdatedAt: "2026-09-16T08:00:00.000Z",
          },
        },
      },
    ],
    entries: [{ cardId: pokeTraceCardId, quantity: 2 }],
    missingCardIds: [],
  });
});

test("GET hydrated portfolio supports an empty PokeTrace portfolio", async () => {
  const app = express();
  app.get(
    "/api/portfolio/cards/hydrated",
    createHydratedPortfolioHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => [],
      loadHydratedCards: async () => ({
        cards: [],
        missingCardIds: [],
      }),
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/portfolio/cards/hydrated",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    cards: [],
    entries: [],
    missingCardIds: [],
  });
});

test("GET hydrated assets runs the real singles and sealed merge", async () => {
  const app = express();
  const entries = [
    { id: pokeTraceCardId, type: "single" as const, quantity: 2 },
    { id: "sealed-product-1", type: "sealed" as const, quantity: 3 },
  ];
  app.get(
    "/api/portfolio/assets/hydrated",
    createHydratedAssetsHandler({
      authenticatedUid: () => "user-123",
      loadEntries: async () => entries,
      loadHydratedAssets: (assetEntries) =>
        getHydratedAssets(assetEntries, {
          loadHydratedCards: async () => ({
            cards: [
              {
                id: pokeTraceCardId,
                name: "Charizard",
                quantity: 2,
              },
            ],
            missingCardIds: [],
          }),
          loadSealedCatalog: async () => ({
            schemaVersion: 1,
            generatedAt: "2026-10-07T00:00:00.000Z",
            products: [
              {
                id: "sealed-product-1",
                name: "Booster Box",
                setName: "Example Set",
                productFamily: "Booster Box",
                currency: "USD",
                price: 120,
                priceSnapshots: { "1d": 118, "7d": 115, "30d": 110 },
              },
            ],
          }),
        }),
    }),
  );

  const response = await requestFromTestServer(
    app,
    "/api/portfolio/assets/hydrated",
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    entries,
    items: [
      { id: pokeTraceCardId, name: "Charizard", quantity: 2, type: "single" },
      {
        id: "sealed-product-1",
        name: "Booster Box",
        setName: "Example Set",
        productFamily: "Booster Box",
        currency: "USD",
        price: 120,
        priceSnapshots: { "1d": 118, "7d": 115, "30d": 110 },
        quantity: 3,
        type: "sealed",
      },
    ],
    missingItems: [],
  });
});

test("hydrated assets preserve entry order and report missing singles and sealed products", async () => {
  const missingSingle = "missing-single";
  const missingSealed = "missing-sealed";
  const entries = [
    { id: pokeTraceCardId, type: "single" as const, quantity: 2 },
    { id: missingSingle, type: "single" as const, quantity: 1 },
    { id: "sealed-product-1", type: "sealed" as const, quantity: 3 },
    { id: missingSealed, type: "sealed" as const, quantity: 4 },
  ];

  const result = await getHydratedAssets(entries, {
    loadHydratedCards: async (singleEntries) => {
      assert.deepEqual(singleEntries, [
        { cardId: pokeTraceCardId, quantity: 2 },
        { cardId: missingSingle, quantity: 1 },
      ]);
      return {
        cards: [{ id: pokeTraceCardId, name: "Charizard", quantity: 2 }],
        missingCardIds: [missingSingle],
      };
    },
    loadSealedCatalog: async () => ({
      schemaVersion: 1,
      generatedAt: "2026-10-07T00:00:00.000Z",
      products: [
        {
          id: "sealed-product-1",
          name: "Booster Box",
          setName: "Example Set",
          productFamily: "Booster Box",
          currency: "USD",
          price: 120,
          priceSnapshots: { "1d": 118, "7d": 115, "30d": 110 },
        },
      ],
    }),
  });

  assert.deepEqual(result, {
    items: [
      {
        id: pokeTraceCardId,
        name: "Charizard",
        quantity: 2,
        type: "single",
      },
      {
        id: "sealed-product-1",
        name: "Booster Box",
        setName: "Example Set",
        productFamily: "Booster Box",
        currency: "USD",
        price: 120,
        priceSnapshots: { "1d": 118, "7d": 115, "30d": 110 },
        quantity: 3,
        type: "sealed",
      },
    ],
    missingItems: [entries[1], entries[3]],
  });
});

test("legacy portfolio documents are parsed as singles", () => {
  assert.deepEqual(parseAssetEntry(pokeTraceCardId, { quantity: 4 }), {
    id: pokeTraceCardId,
    type: "single",
    quantity: 4,
  });
});

test("portfolio asset persistence creates, updates, and removes sealed entries", async () => {
  type FakeDocument = {
    id: string;
    path: string;
  };

  const documents = new Map<string, unknown>();
  const validatedAssets: string[] = [];
  const assetDocument = (
    uid: string,
    type: "single" | "sealed",
    id: string,
  ) => {
    const documentId = type === "single" ? id : `sealed:${id}`;
    return {
      id: documentId,
      path: `users/${uid}/portfolio/${documentId}`,
    };
  };
  const runTransaction = async <T>(
    operation: (transaction: {
      get: (document: FakeDocument) => Promise<{
        exists: boolean;
        data: () => unknown;
      }>;
      create: (document: FakeDocument, value: unknown) => void;
      update: (document: FakeDocument, value: unknown) => void;
    }) => Promise<T>,
  ) =>
    operation({
      get: async (document) => ({
        exists: documents.has(document.path),
        data: () => documents.get(document.path),
      }),
      create: (document, value) => {
        documents.set(document.path, value);
      },
      update: (document, value) => {
        documents.set(document.path, value);
      },
    });
  const dependencies = {
    requireAsset: async (type: "single" | "sealed", id: string) => {
      validatedAssets.push(`${type}:${id}`);
    },
    assetDocument,
    runTransaction,
    deleteDocument: async (document: FakeDocument) => {
      documents.delete(document.path);
    },
  };

  assert.deepEqual(
    await addPortfolioAsset(
      "user-123",
      "sealed",
      "sealed-product-1",
      dependencies,
    ),
    {
      created: true,
      entry: { id: "sealed-product-1", type: "sealed", quantity: 1 },
    },
  );
  assert.deepEqual(validatedAssets, ["sealed:sealed-product-1"]);
  assert.deepEqual(
    documents.get("users/user-123/portfolio/sealed:sealed-product-1"),
    { id: "sealed-product-1", type: "sealed", quantity: 1 },
  );

  assert.equal(
    (
      await addPortfolioAsset(
        "user-123",
        "sealed",
        "sealed-product-1",
        dependencies,
      )
    ).created,
    false,
  );

  assert.deepEqual(
    await updatePortfolioAssetQuantity(
      "user-123",
      "sealed",
      "sealed-product-1",
      5,
      dependencies,
    ),
    { id: "sealed-product-1", type: "sealed", quantity: 5 },
  );
  assert.deepEqual(
    documents.get("users/user-123/portfolio/sealed:sealed-product-1"),
    { id: "sealed-product-1", type: "sealed", quantity: 5 },
  );

  await removePortfolioAsset(
    "user-123",
    "sealed",
    "sealed-product-1",
    dependencies,
  );
  assert.equal(documents.size, 0);

  await assert.rejects(
    updatePortfolioAssetQuantity(
      "user-123",
      "sealed",
      "sealed-product-1",
      2,
      dependencies,
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Portfolio asset not found" &&
      "statusCode" in error &&
      error.statusCode === 404,
  );
});

test("portfolio asset POST, PATCH, and DELETE handlers expose mutation results", async () => {
  const calls: string[] = [];
  const handlers = createPortfolioAssetHandlers({
    authenticatedUid: () => "user-123",
    addAsset: async (uid, type, id) => {
      calls.push(`add:${uid}:${type}:${id}`);
      return { created: true, entry: { id, type, quantity: 1 } };
    },
    updateAssetQuantity: async (uid, type, id, quantity) => {
      calls.push(`update:${uid}:${type}:${id}:${quantity}`);
      return { id, type, quantity };
    },
    removeAsset: async (uid, type, id) => {
      calls.push(`remove:${uid}:${type}:${id}`);
    },
  });
  const app = express();
  app.use(express.json());
  app.post("/api/portfolio/assets", handlers.add);
  app.patch(
    "/api/portfolio/assets/:type/:id/quantity",
    handlers.updateQuantity,
  );
  app.delete("/api/portfolio/assets/:type/:id", handlers.remove);

  const postResponse = await requestFromTestServer(
    app,
    "/api/portfolio/assets",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "sealed", id: "sealed-product-1" }),
    },
  );
  assert.equal(postResponse.status, 201);
  assert.deepEqual(await postResponse.json(), {
    created: true,
    entry: { id: "sealed-product-1", type: "sealed", quantity: 1 },
  });

  const patchResponse = await requestFromTestServer(
    app,
    "/api/portfolio/assets/sealed/sealed-product-1/quantity",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: 5 }),
    },
  );
  assert.equal(patchResponse.status, 200);
  assert.deepEqual(await patchResponse.json(), {
    id: "sealed-product-1",
    type: "sealed",
    quantity: 5,
  });

  const deleteResponse = await requestFromTestServer(
    app,
    "/api/portfolio/assets/sealed/sealed-product-1",
    { method: "DELETE" },
  );
  assert.equal(deleteResponse.status, 204);
  assert.deepEqual(calls, [
    "add:user-123:sealed:sealed-product-1",
    "update:user-123:sealed:sealed-product-1:5",
    "remove:user-123:sealed:sealed-product-1",
  ]);
});
