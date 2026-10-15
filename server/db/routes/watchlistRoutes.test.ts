import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  default as watchlistRoutes,
  addWatchlistAsset,
  createWatchlistHandlers,
  hydrateWatchlist,
  watchlistDocumentPath,
  type WatchlistEntry,
} from "./watchlistRoutes.js";
import { requestFromTestServer } from "./httpTestServer.js";

test("watchlist API rejects unauthenticated reads and writes", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/watchlist", watchlistRoutes);
  for (const method of ["GET", "POST", "DELETE"]) {
    const path = method === "DELETE" ? "/assets/single/card-1" : "/assets";
    const response = await requestFromTestServer(app, `/api/watchlist${path}`, {
      method,
    });
    assert.equal(response.status, 401);
  }
});

test("watchlist writes are idempotent, quantity-free and isolated by account and product type", async () => {
  const documents = new Map<string, WatchlistEntry>();
  let writes = 0;
  const dependencies: NonNullable<Parameters<typeof addWatchlistAsset>[3]> = {
    requireAsset: async () => {},
    runTransaction: async (operation) =>
      operation({
        exists: async (path) => documents.has(path),
        create: (path, entry) => {
          writes++;
          documents.set(path, entry);
        },
      }),
  };
  assert.equal(
    (await addWatchlistAsset("alice", "single", "card-1", dependencies))
      .created,
    true,
  );
  assert.equal(
    (await addWatchlistAsset("alice", "single", "card-1", dependencies))
      .created,
    false,
  );
  await addWatchlistAsset("bob", "single", "card-1", dependencies);
  await addWatchlistAsset("alice", "sealed", "card-1", dependencies);
  assert.equal(writes, 3);
  assert.deepEqual(documents.get("users/alice/watchlist/single:card-1"), {
    id: "card-1",
    type: "single",
  });
  assert.equal(
    watchlistDocumentPath("bob", "sealed", "box-1"),
    "users/bob/watchlist/sealed:box-1",
  );
  assert.ok(
    [...documents.keys()].every((path) => !path.includes("/portfolio/")),
  );
});

test("watchlist hydration reuses price history but never returns quantity", async () => {
  const entries: WatchlistEntry[] = [
    { id: "card-1", type: "single" },
    { id: "missing", type: "sealed" },
  ];
  const result = await hydrateWatchlist(entries, async (input) => {
    assert.deepEqual(
      input,
      entries.map((entry) => ({ ...entry, quantity: 1 })),
    );
    return {
      items: [{ ...input[0], priceSnapshots: { "7d": { marketPrice: 42 } } }],
      missingItems: [input[1]],
    };
  });
  assert.deepEqual(result, {
    items: [
      {
        id: "card-1",
        type: "single",
        priceSnapshots: { "7d": { marketPrice: 42 } },
      },
    ],
    missingItems: [{ id: "missing", type: "sealed" }],
  });
});

test("watchlist routes use the authenticated account, validate input, and expose no quantity update", async () => {
  const calls: unknown[] = [];
  const handlers = createWatchlistHandlers({
    authenticatedUid: () => "trusted-user",
    loadEntries: async (uid) => {
      calls.push(uid);
      return [];
    },
    hydrate: async () => ({ items: [], missingItems: [] }),
    add: async (uid, type, id) => {
      calls.push({ uid, type, id });
      return { created: true, entry: { id, type } };
    },
    remove: async (uid, type, id) => {
      calls.push({ uid, type, id });
    },
  });
  const app = express();
  app.use(express.json());
  app.get("/assets/hydrated", handlers.hydrated);
  app.post("/assets", handlers.add);
  app.delete("/assets/:type/:id", handlers.remove);
  const response = await requestFromTestServer(app, "/assets/hydrated");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    entries: [],
    items: [],
    missingItems: [],
  });
  const post = (body: unknown) =>
    requestFromTestServer(app, "/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const added = await post({
    id: "box-1",
    type: "sealed",
    uid: "attacker",
    quantity: 50,
  });
  assert.equal(added.status, 201);
  assert.deepEqual(await added.json(), {
    created: true,
    entry: { id: "box-1", type: "sealed" },
  });
  assert.deepEqual(calls, [
    "trusted-user",
    { uid: "trusted-user", type: "sealed", id: "box-1" },
  ]);
  assert.equal((await post({ id: "../invalid", type: "single" })).status, 400);
  assert.equal((await post({ id: "card-1", type: "invalid" })).status, 400);
  assert.equal(
    (
      await requestFromTestServer(app, "/assets/sealed/box-1", {
        method: "DELETE",
      })
    ).status,
    204,
  );
  assert.deepEqual(calls.at(-1), {
    uid: "trusted-user",
    type: "sealed",
    id: "box-1",
  });
  assert.equal(
    (
      await requestFromTestServer(app, "/assets/sealed/box-1/quantity", {
        method: "PATCH",
      })
    ).status,
    404,
  );
});
