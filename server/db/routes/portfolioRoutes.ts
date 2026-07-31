import { Router, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { dbAll, dbGet } from "../db.js";
import { parsePublicStoredCard } from "../cardSerialization.js";
import {
  getAuthenticatedUid,
  requireVerifiedUser,
} from "../../security/auth.js";
import { logError } from "../../security/logging.js";
import { adminDb } from "../../subscriptions/firebaseAdmin.js";
import {
  parsePortfolioPriceSnapshot,
  PORTFOLIO_COMPARISON_SNAPSHOTS_SQL,
  type PortfolioComparisonPeriod,
  type PortfolioPriceSnapshot,
  type PortfolioPriceSnapshotRow,
} from "../portfolioPriceSnapshots.js";
import { assessDefaultCardPrices } from "../../services/defaultPriceReliability.js";

const router = Router();
const MAX_QUANTITY = 1_000_000;
const CARD_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const PRICE_SOURCE_PATTERN = /^(tcgplayer|cardmarket):[A-Za-z0-9._-]{1,80}$/;
const CARD_QUERY_CHUNK_SIZE = 400;

type PortfolioEntry = {
  cardId: string;
  quantity: number;
  priceSource?: string;
};

type PortfolioPriceSource = "tcgplayer" | "cardmarket";

type MergeableUserDocument = {
  set: (
    data: { portfolioPriceSource: PortfolioPriceSource },
    options: { merge: true },
  ) => Promise<unknown>;
};

class PortfolioHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PortfolioHttpError";
    this.statusCode = statusCode;
  }
}

const portfolioReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many portfolio requests. Please wait and try again.",
  },
});

const portfolioWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many portfolio changes. Please wait and try again.",
  },
});

function getCardId(value: unknown) {
  const cardId = typeof value === "string" ? value.trim() : "";
  if (!CARD_ID_PATTERN.test(cardId)) {
    throw new PortfolioHttpError("Invalid card ID", 400);
  }
  return cardId;
}

function getQuantity(value: unknown) {
  if (typeof value !== "number") {
    throw new PortfolioHttpError("quantity must be a number", 400);
  }
  const quantity = value;
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_QUANTITY
  ) {
    throw new PortfolioHttpError(
      `quantity must be an integer between 1 and ${MAX_QUANTITY}`,
      400,
    );
  }
  return quantity;
}

function getPriceSource(value: unknown) {
  const priceSource = typeof value === "string" ? value.trim() : "";
  if (!PRICE_SOURCE_PATTERN.test(priceSource)) {
    throw new PortfolioHttpError(
      "priceSource must look like tcgplayer:variant or cardmarket:field",
      400,
    );
  }
  return priceSource;
}

function getPortfolioPriceSource(value: unknown): PortfolioPriceSource {
  if (value === "tcgplayer" || value === "cardmarket") return value;
  throw new PortfolioHttpError(
    "priceSource must be tcgplayer or cardmarket",
    400,
  );
}

function parseStoredPortfolioPriceSource(value: unknown): PortfolioPriceSource {
  return value === "cardmarket" ? "cardmarket" : "tcgplayer";
}

export async function savePortfolioPriceSourcePreference(
  document: MergeableUserDocument,
  portfolioPriceSource: PortfolioPriceSource,
) {
  await document.set({ portfolioPriceSource }, { merge: true });
}

function parseStoredPortfolioEntry(
  cardId: string,
  data: unknown,
): PortfolioEntry {
  if (!CARD_ID_PATTERN.test(cardId)) {
    throw new Error("Stored portfolio entry has an invalid card ID");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Portfolio entry ${cardId} is not an object`);
  }

  const fields = data as Record<string, unknown>;
  const unexpectedFields = Object.keys(fields).filter(
    (field) => field !== "quantity" && field !== "priceSource",
  );
  if (unexpectedFields.length > 0) {
    throw new Error(`Portfolio entry ${cardId} contains unsupported fields`);
  }
  const quantity = fields.quantity;
  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_QUANTITY
  ) {
    throw new Error(`Portfolio entry ${cardId} has an invalid quantity`);
  }

  let priceSource: string | undefined;
  if (fields.priceSource !== undefined) {
    if (
      typeof fields.priceSource !== "string" ||
      !PRICE_SOURCE_PATTERN.test(fields.priceSource.trim())
    ) {
      throw new Error(`Portfolio entry ${cardId} has an invalid price source`);
    }
    priceSource = fields.priceSource.trim();
  }

  return {
    cardId,
    quantity,
    ...(priceSource && { priceSource }),
  };
}

async function requireCardInDatabase(cardId: string) {
  const row = await dbGet<{ id: string }>("SELECT id FROM cards WHERE id = ?", [
    cardId,
  ]);
  if (!row) {
    throw new PortfolioHttpError("Card not found", 404);
  }
}

function portfolioCollection(uid: string) {
  return adminDb.collection(`users/${uid}/portfolio`);
}

function userDocument(uid: string) {
  return adminDb.doc(`users/${uid}`);
}

async function getPortfolioEntries(uid: string): Promise<PortfolioEntry[]> {
  const snapshot = await portfolioCollection(uid).get();
  return snapshot.docs.map((document) =>
    parseStoredPortfolioEntry(document.id, document.data()),
  );
}

async function getHydratedCards(entries: PortfolioEntry[]) {
  const rows: Array<{ id: string; raw_json: string }> = [];
  const snapshotsByCardId = new Map<
    string,
    Partial<Record<PortfolioComparisonPeriod, PortfolioPriceSnapshot>>
  >();

  for (
    let offset = 0;
    offset < entries.length;
    offset += CARD_QUERY_CHUNK_SIZE
  ) {
    const cardIds = entries
      .slice(offset, offset + CARD_QUERY_CHUNK_SIZE)
      .map((entry) => entry.cardId);
    const placeholders = cardIds.map(() => "?").join(", ");
    const [chunkRows, snapshotRows] = await Promise.all([
      dbAll<{ id: string; raw_json: string }>(
        `SELECT id, raw_json FROM cards WHERE id IN (${placeholders})`,
        cardIds,
      ),
      dbAll<PortfolioPriceSnapshotRow>(PORTFOLIO_COMPARISON_SNAPSHOTS_SQL, [
        JSON.stringify(cardIds),
      ]),
    ]);
    rows.push(...chunkRows);

    for (const snapshotRow of snapshotRows) {
      const cardId = String(snapshotRow.card_id);
      const snapshots = snapshotsByCardId.get(cardId) ?? {};
      snapshots[snapshotRow.comparison_period] =
        parsePortfolioPriceSnapshot(snapshotRow);
      snapshotsByCardId.set(cardId, snapshots);
    }
  }

  const cardsById = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const cardId = String(row.id);
    const card = parsePublicStoredCard(String(row.raw_json));
    delete card.quantity;
    delete card.priceSource;
    delete card.latestPriceSnapshot;
    delete card.previousPriceSnapshot;
    delete card.priceSnapshots;
    cardsById.set(cardId, card);
  }

  const cards: Record<string, unknown>[] = [];
  const missingCardIds: string[] = [];

  for (const entry of entries) {
    const card = cardsById.get(entry.cardId);
    if (!card) {
      missingCardIds.push(entry.cardId);
      continue;
    }

    const priceSnapshots = snapshotsByCardId.get(entry.cardId);
    const priceReliability = assessDefaultCardPrices(
      card,
      priceSnapshots?.["24h"]?.cardmarketPrices,
    );

    cards.push({
      ...card,
      id: entry.cardId,
      quantity: entry.quantity,
      ...(entry.priceSource && { priceSource: entry.priceSource }),
      priceReliability,
      ...(priceSnapshots && { priceSnapshots }),
    });
  }

  if (missingCardIds.length > 0) {
    const sample = missingCardIds.slice(0, 20).join(", ");
    const remainder =
      missingCardIds.length > 20
        ? ` (+${missingCardIds.length - 20} more)`
        : "";
    console.warn(
      `Portfolio contains ${missingCardIds.length} card reference(s) unavailable in SQL: ${sample}${remainder}. References were left unchanged.`,
    );
  }

  return { cards, missingCardIds };
}

type HydratedPortfolioHandlerDependencies = {
  authenticatedUid: (res: Response) => string;
  loadEntries: (uid: string) => Promise<PortfolioEntry[]>;
  loadHydratedCards: typeof getHydratedCards;
  loadStoredPriceSource: (uid: string) => Promise<unknown>;
};

export function createHydratedPortfolioHandler(
  dependencies: Partial<HydratedPortfolioHandlerDependencies> = {},
): RequestHandler {
  const authenticatedUid = dependencies.authenticatedUid ?? getAuthenticatedUid;
  const loadEntries = dependencies.loadEntries ?? getPortfolioEntries;
  const loadHydratedCards = dependencies.loadHydratedCards ?? getHydratedCards;
  const loadStoredPriceSource =
    dependencies.loadStoredPriceSource ??
    (async (uid: string) => {
      const snapshot = await userDocument(uid).get();
      return snapshot.data()?.portfolioPriceSource;
    });

  return async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const uid = authenticatedUid(res);
      const [entries, storedPriceSource] = await Promise.all([
        loadEntries(uid),
        loadStoredPriceSource(uid),
      ]);
      const { cards, missingCardIds } = await loadHydratedCards(entries);
      const portfolioPriceSource =
        parseStoredPortfolioPriceSource(storedPriceSource);
      res.json({ cards, entries, missingCardIds, portfolioPriceSource });
    } catch (error) {
      sendPortfolioError(res, error, "Failed to load hydrated portfolio");
    }
  };
}

type UpdatePortfolioPriceSourceHandlerDependencies = {
  authenticatedUid: (res: Response) => string;
  savePriceSource: (
    uid: string,
    priceSource: PortfolioPriceSource,
  ) => Promise<void>;
};

export function createUpdatePortfolioPriceSourceHandler(
  dependencies: Partial<UpdatePortfolioPriceSourceHandlerDependencies> = {},
): RequestHandler {
  const authenticatedUid = dependencies.authenticatedUid ?? getAuthenticatedUid;
  const savePriceSource =
    dependencies.savePriceSource ??
    (async (uid: string, priceSource: PortfolioPriceSource) => {
      await savePortfolioPriceSourcePreference(userDocument(uid), priceSource);
    });

  return async (req, res) => {
    try {
      const uid = authenticatedUid(res);
      const portfolioPriceSource = getPortfolioPriceSource(
        req.body?.priceSource,
      );
      await savePriceSource(uid, portfolioPriceSource);
      res.json({ portfolioPriceSource });
    } catch (error) {
      sendPortfolioError(res, error, "Failed to update portfolio price source");
    }
  };
}

function portfolioCardRef(uid: string, cardId: string) {
  return adminDb.doc(`users/${uid}/portfolio/${cardId}`);
}

function sendPortfolioError(res: Response, error: unknown, context: string) {
  if (error instanceof PortfolioHttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  logError(context, error);
  res.status(500).json({ message: "Portfolio request failed" });
}

router.use(requireVerifiedUser);

router.get("/cards", portfolioReadLimiter, async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const uid = getAuthenticatedUid(res);
    const entries = await getPortfolioEntries(uid);
    res.json({ entries });
  } catch (error) {
    sendPortfolioError(res, error, "Failed to load portfolio references");
  }
});

router.get(
  "/cards/hydrated",
  portfolioReadLimiter,
  createHydratedPortfolioHandler(),
);

router.patch(
  "/price-source",
  portfolioWriteLimiter,
  createUpdatePortfolioPriceSourceHandler(),
);

router.post("/cards", portfolioWriteLimiter, async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    const cardId = getCardId(req.body?.cardId);
    await requireCardInDatabase(cardId);

    const cardRef = portfolioCardRef(uid, cardId);
    const result = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(cardRef);
      if (existing.exists) {
        return {
          created: false,
          entry: parseStoredPortfolioEntry(cardId, existing.data()),
        };
      }

      const entry: PortfolioEntry = { cardId, quantity: 1 };
      transaction.create(cardRef, { quantity: entry.quantity });
      return { created: true, entry };
    });

    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    sendPortfolioError(res, error, "Failed to add portfolio card");
  }
});

router.patch(
  "/cards/:cardId/quantity",
  portfolioWriteLimiter,
  async (req, res) => {
    try {
      const uid = getAuthenticatedUid(res);
      const cardId = getCardId(req.params.cardId);
      const quantity = getQuantity(req.body?.quantity);
      const cardRef = portfolioCardRef(uid, cardId);

      const entry = await adminDb.runTransaction(async (transaction) => {
        const cardSnap = await transaction.get(cardRef);
        if (!cardSnap.exists) {
          throw new PortfolioHttpError("Portfolio card not found", 404);
        }

        const existing = parseStoredPortfolioEntry(cardId, cardSnap.data());
        const updatedEntry = { ...existing, quantity };
        transaction.update(cardRef, { quantity });
        return updatedEntry;
      });

      res.json(entry);
    } catch (error) {
      sendPortfolioError(res, error, "Failed to update portfolio quantity");
    }
  },
);

router.patch(
  "/cards/:cardId/price-source",
  portfolioWriteLimiter,
  async (req, res) => {
    try {
      const uid = getAuthenticatedUid(res);
      const cardId = getCardId(req.params.cardId);
      const priceSource = getPriceSource(req.body?.priceSource);
      const cardRef = portfolioCardRef(uid, cardId);

      const entry = await adminDb.runTransaction(async (transaction) => {
        const cardSnap = await transaction.get(cardRef);
        if (!cardSnap.exists) {
          throw new PortfolioHttpError("Portfolio card not found", 404);
        }

        const existing = parseStoredPortfolioEntry(cardId, cardSnap.data());
        const updatedEntry = { ...existing, priceSource };
        transaction.update(cardRef, { priceSource });
        return updatedEntry;
      });

      res.json(entry);
    } catch (error) {
      sendPortfolioError(res, error, "Failed to update portfolio price source");
    }
  },
);

router.delete("/cards/:cardId", portfolioWriteLimiter, async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    const cardId = getCardId(req.params.cardId);

    await portfolioCardRef(uid, cardId).delete();
    res.status(204).send();
  } catch (error) {
    sendPortfolioError(res, error, "Failed to remove portfolio card");
  }
});

export default router;
