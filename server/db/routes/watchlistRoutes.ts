import { Router, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  getAuthenticatedUid,
  requireVerifiedUser,
} from "../../security/auth.js";
import { adminDb } from "../../subscriptions/firebaseAdmin.js";
import {
  getAssetId,
  getAssetType,
  getHydratedAssets,
  requireLocalAsset,
  sendError,
  type PortfolioAssetType,
} from "./portfolioRoutes.js";

export type WatchlistEntry = { id: string; type: PortfolioAssetType };

export function watchlistDocumentPath(
  uid: string,
  type: PortfolioAssetType,
  id: string,
) {
  return `users/${uid}/watchlist/${type}:${id}`;
}

async function loadEntries(uid: string): Promise<WatchlistEntry[]> {
  const snapshot = await adminDb.collection(`users/${uid}/watchlist`).get();
  return snapshot.docs.map((document) => {
    const entry = document.data();
    return { id: getAssetId(entry.id), type: getAssetType(entry.type) };
  });
}

type WatchlistTransaction = {
  exists: (path: string) => Promise<boolean>;
  create: (path: string, entry: WatchlistEntry) => void;
};
type TransactionRunner = <T>(
  operation: (transaction: WatchlistTransaction) => Promise<T>,
) => Promise<T>;
const runTransaction: TransactionRunner = (operation) =>
  adminDb.runTransaction((transaction) =>
    operation({
      exists: async (path) => (await transaction.get(adminDb.doc(path))).exists,
      create: (path, entry) => {
        transaction.create(adminDb.doc(path), entry);
      },
    }),
  );

export async function addWatchlistAsset(
  uid: string,
  type: PortfolioAssetType,
  id: string,
  dependencies: {
    requireAsset?: typeof requireLocalAsset;
    runTransaction?: TransactionRunner;
  } = {},
) {
  await (dependencies.requireAsset ?? requireLocalAsset)(type, id);
  const path = watchlistDocumentPath(uid, type, id);
  return (dependencies.runTransaction ?? runTransaction)(
    async (transaction) => {
      const exists = await transaction.exists(path);
      const entry = { id, type };
      if (!exists) transaction.create(path, entry);
      return { created: !exists, entry };
    },
  );
}

async function removeAsset(uid: string, type: PortfolioAssetType, id: string) {
  await adminDb.doc(watchlistDocumentPath(uid, type, id)).delete();
}

// Quantity is only an adapter for the shared catalog hydrator, never watchlist data.
export async function hydrateWatchlist(
  entries: WatchlistEntry[],
  hydrate = getHydratedAssets,
) {
  const result = await hydrate(
    entries.map((entry) => ({ ...entry, quantity: 1 })),
  );
  return {
    items: result.items.map((item) => {
      const watchedItem = { ...item };
      delete watchedItem.quantity;
      return watchedItem;
    }),
    missingItems: result.missingItems.map(({ id, type }) => ({ id, type })),
  };
}

type Dependencies = {
  authenticatedUid: (res: Response) => string;
  loadEntries: typeof loadEntries;
  hydrate: typeof hydrateWatchlist;
  add: typeof addWatchlistAsset;
  remove: typeof removeAsset;
};

export function createWatchlistHandlers(overrides: Partial<Dependencies> = {}) {
  const deps = {
    authenticatedUid: getAuthenticatedUid,
    loadEntries,
    hydrate: hydrateWatchlist,
    add: addWatchlistAsset,
    remove: removeAsset,
    ...overrides,
  };
  const read =
    (hydrated: boolean): RequestHandler =>
    async (_req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      try {
        const entries = await deps.loadEntries(deps.authenticatedUid(res));
        res.json({ entries, ...(hydrated ? await deps.hydrate(entries) : {}) });
      } catch (error) {
        sendError(res, error, "Failed to load watchlist");
      }
    };
  const add: RequestHandler = async (req, res) => {
    try {
      const result = await deps.add(
        deps.authenticatedUid(res),
        getAssetType(req.body?.type),
        getAssetId(req.body?.id),
      );
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendError(res, error, "Failed to add watchlist item");
    }
  };
  const remove: RequestHandler = async (req, res) => {
    try {
      await deps.remove(
        deps.authenticatedUid(res),
        getAssetType(req.params.type),
        getAssetId(req.params.id),
      );
      res.status(204).send();
    } catch (error) {
      sendError(res, error, "Failed to remove watchlist item");
    }
  };
  return { read: read(false), hydrated: read(true), add, remove };
}

const router = Router();
const limiter = (max: number) =>
  rateLimit({
    windowMs: 60_000,
    max,
    keyGenerator: (_req, res) => String(res.locals.authUid),
    standardHeaders: true,
    legacyHeaders: false,
  });
const readLimiter = limiter(120);
const writeLimiter = limiter(30);
const handlers = createWatchlistHandlers();
router.use(requireVerifiedUser);
router.get("/assets", readLimiter, handlers.read);
router.get("/assets/hydrated", readLimiter, handlers.hydrated);
router.post("/assets", writeLimiter, handlers.add);
router.delete("/assets/:type/:id", writeLimiter, handlers.remove);
export default router;
