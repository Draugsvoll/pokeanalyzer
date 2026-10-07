import { Router, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { ensurePokeTraceReady, pokeTraceDb } from "../pokeTraceDb.js";
import {
  getAuthenticatedUid,
  requireVerifiedUser,
} from "../../security/auth.js";
import { logError } from "../../security/logging.js";
import { adminDb } from "../../subscriptions/firebaseAdmin.js";
import { toPokemonCard } from "../../services/pokeTraceCardView.js";
import { loadPokeTracePortfolioHistory } from "../../services/pokeTracePortfolioHistory.js";
import { getCachedPokeTraceSealedCatalog } from "../../services/pokeTraceSealedCatalog.js";
import { parsePokeTraceMarketComparisons } from "../../../shared/pokeTraceMarketComparisons.js";

type PortfolioEntry = { cardId: string; quantity: number };
export type PortfolioAssetType = "single" | "sealed";
export type PortfolioAssetEntry = {
  id: string;
  type: PortfolioAssetType;
  quantity: number;
};

const router = Router();
const MAX_QUANTITY = 1_000_000;
const ASSET_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const CARD_QUERY_CHUNK_SIZE = 400;

class PortfolioHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
});

function getAssetId(value: unknown, label = "asset") {
  const id = typeof value === "string" ? value.trim() : "";
  if (!ASSET_ID_PATTERN.test(id)) {
    throw new PortfolioHttpError(`Invalid ${label} ID`, 400);
  }
  return id;
}

function getCardId(value: unknown) {
  return getAssetId(value, "card");
}

function getAssetType(value: unknown): PortfolioAssetType {
  if (value === "single" || value === "sealed") return value;
  throw new PortfolioHttpError("Invalid portfolio asset type", 400);
}

function getQuantity(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_QUANTITY
  ) {
    throw new PortfolioHttpError(
      `quantity must be an integer between 1 and ${MAX_QUANTITY}`,
      400,
    );
  }
  return value;
}

export function parseAssetEntry(
  documentId: string,
  value: unknown,
): PortfolioAssetEntry {
  const fields =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const type = fields.type === undefined ? "single" : getAssetType(fields.type);
  const id = getAssetId(
    fields.id === undefined && type === "single" ? documentId : fields.id,
  );
  return { id, type, quantity: getQuantity(fields.quantity) };
}

function portfolioCollection(uid: string) {
  return adminDb.collection(`users/${uid}/portfolio`);
}

function portfolioAssetDocument(
  uid: string,
  type: PortfolioAssetType,
  id: string,
) {
  const documentId = type === "single" ? id : `sealed:${id}`;
  return {
    id: documentId,
    path: `users/${uid}/portfolio/${documentId}`,
  };
}

async function getPortfolioAssetEntries(uid: string) {
  const snapshot = await portfolioCollection(uid).get();
  return snapshot.docs.map((document) =>
    parseAssetEntry(document.id, document.data()),
  );
}

async function getPortfolioEntries(uid: string) {
  const entries = await getPortfolioAssetEntries(uid);
  return entries.flatMap((entry) =>
    entry.type === "single"
      ? [{ cardId: entry.id, quantity: entry.quantity }]
      : [],
  );
}

async function requireLocalCard(cardId: string) {
  await ensurePokeTraceReady();
  const result = await pokeTraceDb.execute({
    sql: "SELECT 1 FROM poketrace_cards WHERE id = ?",
    args: [cardId],
  });
  if (!result.rows[0]) throw new PortfolioHttpError("Card not found", 404);
}

async function requireLocalAsset(type: PortfolioAssetType, id: string) {
  if (type === "single") {
    await requireLocalCard(id);
    return;
  }
  await ensurePokeTraceReady();
  const result = await pokeTraceDb.execute({
    sql: "SELECT 1 FROM poketrace_sealed_products WHERE id = ?",
    args: [id],
  });
  if (!result.rows[0]) {
    throw new PortfolioHttpError("Sealed product not found", 404);
  }
}

async function getHydratedCards(entries: PortfolioEntry[]) {
  await ensurePokeTraceReady();
  const cardsById = new Map<string, Record<string, unknown>>();

  for (
    let offset = 0;
    offset < entries.length;
    offset += CARD_QUERY_CHUNK_SIZE
  ) {
    const cardIds = entries
      .slice(offset, offset + CARD_QUERY_CHUNK_SIZE)
      .map((entry) => entry.cardId);
    if (cardIds.length === 0) continue;
    const placeholders = cardIds.map(() => "?").join(", ");
    const result = await pokeTraceDb.execute({
      sql: `SELECT id, raw_json, tcg_market_comparisons FROM poketrace_cards WHERE id IN (${placeholders})`,
      args: cardIds,
    });
    const comparisonCacheByCardId = new Map(
      result.rows.flatMap((row) => {
        const cache = parsePokeTraceMarketComparisons(
          row.tcg_market_comparisons,
        );
        return cache ? [[String(row.id), cache] as const] : [];
      }),
    );
    const cardIdsWithoutCache = result.rows
      .map((row) => String(row.id))
      .filter((cardId) => !comparisonCacheByCardId.has(cardId));
    const historyByCardId = await loadPokeTracePortfolioHistory(
      pokeTraceDb,
      cardIdsWithoutCache,
    );
    for (const row of result.rows) {
      const cardId = String(row.id);
      const cachedComparisons = comparisonCacheByCardId.get(cardId);
      const priceSnapshots = cachedComparisons
        ? Object.fromEntries(
            Object.entries(cachedComparisons.comparisons).flatMap(
              ([period, snapshot]) =>
                snapshot
                  ? [
                      [
                        period,
                        {
                          recordedAt: snapshot.recordedAt,
                          marketPrice: snapshot.marketPrice,
                          sourceUpdatedAt: snapshot.sourceUpdatedAt,
                        },
                      ],
                    ]
                  : [],
            ),
          )
        : historyByCardId.get(cardId);
      cardsById.set(cardId, {
        ...toPokemonCard(row.raw_json, {}, [], row.tcg_market_comparisons),
        ...(priceSnapshots && { priceSnapshots }),
      });
    }
  }

  const cards: Record<string, unknown>[] = [];
  const missingCardIds: string[] = [];
  for (const entry of entries) {
    const card = cardsById.get(entry.cardId);
    if (card) cards.push({ ...card, quantity: entry.quantity });
    else missingCardIds.push(entry.cardId);
  }
  return { cards, missingCardIds };
}

type HydratedAssetDependencies = {
  loadHydratedCards: typeof getHydratedCards;
  loadSealedCatalog: typeof getCachedPokeTraceSealedCatalog;
};

export async function getHydratedAssets(
  entries: PortfolioAssetEntry[],
  dependencies: Partial<HydratedAssetDependencies> = {},
) {
  const loadHydratedCards = dependencies.loadHydratedCards ?? getHydratedCards;
  const loadSealedCatalog =
    dependencies.loadSealedCatalog ?? getCachedPokeTraceSealedCatalog;
  const singleEntries = entries.flatMap((entry) =>
    entry.type === "single"
      ? [{ cardId: entry.id, quantity: entry.quantity }]
      : [],
  );
  const hasSealedEntries = entries.some((entry) => entry.type === "sealed");
  const [{ cards }, sealedCatalog] = await Promise.all([
    singleEntries.length > 0
      ? loadHydratedCards(singleEntries)
      : Promise.resolve({ cards: [], missingCardIds: [] }),
    hasSealedEntries ? loadSealedCatalog() : null,
  ]);
  const singlesById = new Map(
    cards.map(
      (card) => [String(card.id), { ...card, type: "single" }] as const,
    ),
  );
  const sealedById = new Map(
    (sealedCatalog?.products ?? []).map((product) => [product.id, product]),
  );
  const items: Record<string, unknown>[] = [];
  const missingItems: PortfolioAssetEntry[] = [];

  for (const entry of entries) {
    if (entry.type === "single") {
      const single = singlesById.get(entry.id);
      if (single) items.push(single);
      else missingItems.push(entry);
      continue;
    }

    const sealed = sealedById.get(entry.id);
    if (sealed) {
      items.push({ ...sealed, quantity: entry.quantity, type: "sealed" });
    } else {
      missingItems.push(entry);
    }
  }

  return { items, missingItems };
}

type PortfolioAssetDocument = ReturnType<typeof portfolioAssetDocument>;
type PortfolioAssetTransaction = {
  get: (document: PortfolioAssetDocument) => Promise<{
    exists: boolean;
    data: () => unknown;
  }>;
  create: (
    document: PortfolioAssetDocument,
    value: PortfolioAssetEntry,
  ) => void;
  update: (
    document: PortfolioAssetDocument,
    value: PortfolioAssetEntry,
  ) => void;
};
type PortfolioTransactionRunner = <T>(
  updateFunction: (transaction: PortfolioAssetTransaction) => Promise<T>,
) => Promise<T>;

type PortfolioWriteDependencies = {
  requireAsset: typeof requireLocalAsset;
  assetDocument: typeof portfolioAssetDocument;
  runTransaction: PortfolioTransactionRunner;
  deleteDocument: (document: PortfolioAssetDocument) => Promise<void>;
};

const runPortfolioTransaction: PortfolioTransactionRunner = (updateFunction) =>
  adminDb.runTransaction((transaction) =>
    updateFunction({
      get: async (document) => {
        const snapshot = await transaction.get(adminDb.doc(document.path));
        return {
          exists: snapshot.exists,
          data: () => snapshot.data(),
        };
      },
      create: (document, value) => {
        transaction.create(adminDb.doc(document.path), value);
      },
      update: (document, value) => {
        transaction.update(adminDb.doc(document.path), value);
      },
    }),
  );

const deletePortfolioAssetDocument = async (
  document: PortfolioAssetDocument,
) => {
  await adminDb.doc(document.path).delete();
};

export async function addPortfolioAsset(
  uid: string,
  type: PortfolioAssetType,
  id: string,
  dependencies: Partial<PortfolioWriteDependencies> = {},
) {
  await (dependencies.requireAsset ?? requireLocalAsset)(type, id);
  const assetDocument = (dependencies.assetDocument ?? portfolioAssetDocument)(
    uid,
    type,
    id,
  );
  const runTransaction = dependencies.runTransaction ?? runPortfolioTransaction;
  return runTransaction(async (transaction) => {
    const existing = await transaction.get(assetDocument);
    if (existing.exists) {
      return {
        created: false,
        entry: parseAssetEntry(assetDocument.id, existing.data()),
      };
    }
    const entry = { id, type, quantity: 1 };
    transaction.create(assetDocument, entry);
    return { created: true, entry };
  });
}

export async function updatePortfolioAssetQuantity(
  uid: string,
  type: PortfolioAssetType,
  id: string,
  quantity: number,
  dependencies: Partial<PortfolioWriteDependencies> = {},
) {
  const assetDocument = (dependencies.assetDocument ?? portfolioAssetDocument)(
    uid,
    type,
    id,
  );
  const runTransaction = dependencies.runTransaction ?? runPortfolioTransaction;
  return runTransaction(async (transaction) => {
    const existing = await transaction.get(assetDocument);
    if (!existing.exists) {
      throw new PortfolioHttpError("Portfolio asset not found", 404);
    }
    transaction.update(assetDocument, { id, type, quantity });
    return { id, type, quantity };
  });
}

export async function removePortfolioAsset(
  uid: string,
  type: PortfolioAssetType,
  id: string,
  dependencies: Partial<
    Pick<PortfolioWriteDependencies, "assetDocument" | "deleteDocument">
  > = {},
) {
  const document = (dependencies.assetDocument ?? portfolioAssetDocument)(
    uid,
    type,
    id,
  );
  await (dependencies.deleteDocument ?? deletePortfolioAssetDocument)(document);
}

function sendError(res: Response, error: unknown, context: string) {
  if (error instanceof PortfolioHttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }
  logError(context, error);
  res.status(500).json({ message: "Portfolio request failed" });
}

type HydratedDependencies = {
  authenticatedUid: (res: Response) => string;
  loadEntries: (uid: string) => Promise<PortfolioEntry[]>;
  loadHydratedCards: typeof getHydratedCards;
};

export function createHydratedPortfolioHandler(
  dependencies: Partial<HydratedDependencies> = {},
): RequestHandler {
  const authenticatedUid = dependencies.authenticatedUid ?? getAuthenticatedUid;
  const loadEntries = dependencies.loadEntries ?? getPortfolioEntries;
  const loadHydratedCards = dependencies.loadHydratedCards ?? getHydratedCards;

  return async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const uid = authenticatedUid(res);
      const entries = await loadEntries(uid);
      const { cards, missingCardIds } = await loadHydratedCards(entries);
      res.json({
        cards,
        entries,
        missingCardIds,
      });
    } catch (error) {
      sendError(res, error, "Failed to load hydrated portfolio");
    }
  };
}

type HydratedAssetsDependencies = {
  authenticatedUid: (res: Response) => string;
  loadEntries: (uid: string) => Promise<PortfolioAssetEntry[]>;
  loadHydratedAssets: typeof getHydratedAssets;
};

export function createHydratedAssetsHandler(
  dependencies: Partial<HydratedAssetsDependencies> = {},
): RequestHandler {
  const authenticatedUid = dependencies.authenticatedUid ?? getAuthenticatedUid;
  const loadEntries = dependencies.loadEntries ?? getPortfolioAssetEntries;
  const loadHydratedAssets =
    dependencies.loadHydratedAssets ?? getHydratedAssets;

  return async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const entries = await loadEntries(authenticatedUid(res));
      const { items, missingItems } = await loadHydratedAssets(entries);
      res.json({ entries, items, missingItems });
    } catch (error) {
      sendError(res, error, "Failed to load hydrated portfolio assets");
    }
  };
}

type PortfolioAssetHandlerDependencies = {
  authenticatedUid: (res: Response) => string;
  addAsset: typeof addPortfolioAsset;
  updateAssetQuantity: typeof updatePortfolioAssetQuantity;
  removeAsset: typeof removePortfolioAsset;
};

export function createPortfolioAssetHandlers(
  dependencies: Partial<PortfolioAssetHandlerDependencies> = {},
) {
  const authenticatedUid = dependencies.authenticatedUid ?? getAuthenticatedUid;
  const addAsset = dependencies.addAsset ?? addPortfolioAsset;
  const updateAssetQuantity =
    dependencies.updateAssetQuantity ?? updatePortfolioAssetQuantity;
  const removeAsset = dependencies.removeAsset ?? removePortfolioAsset;

  const add: RequestHandler = async (req, res) => {
    try {
      const uid = authenticatedUid(res);
      const type = getAssetType(req.body?.type);
      const id = getAssetId(req.body?.id);
      const result = await addAsset(uid, type, id);
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendError(res, error, "Failed to add portfolio asset");
    }
  };

  const updateQuantity: RequestHandler = async (req, res) => {
    try {
      const uid = authenticatedUid(res);
      const type = getAssetType(req.params.type);
      const id = getAssetId(req.params.id);
      const quantity = getQuantity(req.body?.quantity);
      const entry = await updateAssetQuantity(uid, type, id, quantity);
      res.json(entry);
    } catch (error) {
      sendError(res, error, "Failed to update portfolio asset quantity");
    }
  };

  const remove: RequestHandler = async (req, res) => {
    try {
      const uid = authenticatedUid(res);
      const type = getAssetType(req.params.type);
      const id = getAssetId(req.params.id);
      await removeAsset(uid, type, id);
      res.status(204).send();
    } catch (error) {
      sendError(res, error, "Failed to remove portfolio asset");
    }
  };

  return { add, updateQuantity, remove };
}

router.use(requireVerifiedUser);

router.get("/assets", readLimiter, async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    res.json({
      entries: await getPortfolioAssetEntries(getAuthenticatedUid(res)),
    });
  } catch (error) {
    sendError(res, error, "Failed to load portfolio references");
  }
});

router.get("/assets/hydrated", readLimiter, createHydratedAssetsHandler());

const portfolioAssetHandlers = createPortfolioAssetHandlers();
router.post("/assets", writeLimiter, portfolioAssetHandlers.add);
router.patch(
  "/assets/:type/:id/quantity",
  writeLimiter,
  portfolioAssetHandlers.updateQuantity,
);
router.delete("/assets/:type/:id", writeLimiter, portfolioAssetHandlers.remove);

router.get("/cards", readLimiter, async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    res.json({ entries: await getPortfolioEntries(getAuthenticatedUid(res)) });
  } catch (error) {
    sendError(res, error, "Failed to load portfolio references");
  }
});

router.get("/cards/hydrated", readLimiter, createHydratedPortfolioHandler());

router.post("/cards", writeLimiter, async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    const cardId = getCardId(req.body?.cardId);
    const result = await addPortfolioAsset(uid, "single", cardId);
    res.status(result.created ? 201 : 200).json({
      created: result.created,
      entry: { cardId: result.entry.id, quantity: result.entry.quantity },
    });
  } catch (error) {
    sendError(res, error, "Failed to add portfolio card");
  }
});

router.patch("/cards/:cardId/quantity", writeLimiter, async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    const cardId = getCardId(req.params.cardId);
    const quantity = getQuantity(req.body?.quantity);
    const entry = await updatePortfolioAssetQuantity(
      uid,
      "single",
      cardId,
      quantity,
    );
    res.json({ cardId: entry.id, quantity: entry.quantity });
  } catch (error) {
    sendError(res, error, "Failed to update portfolio quantity");
  }
});

router.delete("/cards/:cardId", writeLimiter, async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    await removePortfolioAsset(uid, "single", getCardId(req.params.cardId));
    res.status(204).send();
  } catch (error) {
    sendError(res, error, "Failed to remove portfolio card");
  }
});

export default router;
