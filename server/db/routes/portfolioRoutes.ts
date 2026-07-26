import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { dbAll, dbGet } from "../db.js";
import { parsePublicStoredCard } from "../cardSerialization.js";
import { getAuthenticatedUid, requireVerifiedUser } from "../../security/auth.js";
import { logError } from "../../security/logging.js";
import { adminDb } from "../../subscriptions/firebaseAdmin.js";

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

function readStoredQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_QUANTITY
    ? quantity
    : 1;
}

function readStoredPriceSource(value: unknown) {
  const priceSource = typeof value === "string" ? value.trim() : "";
  return PRICE_SOURCE_PATTERN.test(priceSource) ? priceSource : undefined;
}

function toPortfolioEntry(
  cardId: string,
  data: Record<string, unknown> | undefined,
): PortfolioEntry {
  const priceSource = readStoredPriceSource(data?.priceSource);
  return {
    cardId,
    quantity: readStoredQuantity(data?.quantity),
    ...(priceSource && { priceSource }),
  };
}

async function requireCardInDatabase(cardId: string) {
  const row = await dbGet<{ id: string }>(
    "SELECT id FROM cards WHERE id = ?",
    [cardId],
  );
  if (!row) {
    throw new PortfolioHttpError("Card not found", 404);
  }
}

function portfolioCollection(uid: string) {
  return adminDb.collection(`users/${uid}/portfolio`);
}

async function getPortfolioEntries(uid: string): Promise<PortfolioEntry[]> {
  const snapshot = await portfolioCollection(uid).get();
  const entries: PortfolioEntry[] = [];
  let invalidIdCount = 0;

  for (const document of snapshot.docs) {
    if (!CARD_ID_PATTERN.test(document.id)) {
      invalidIdCount += 1;
      continue;
    }

    entries.push(
      toPortfolioEntry(
        document.id,
        document.data() as Record<string, unknown>,
      ),
    );
  }

  if (invalidIdCount > 0) {
    console.warn(
      `Ignored ${invalidIdCount} portfolio document(s) with invalid card IDs.`,
    );
  }

  return entries;
}

async function getHydratedCards(entries: PortfolioEntry[]) {
  const rows: Array<{ id: string; raw_json: string }> = [];

  for (let offset = 0; offset < entries.length; offset += CARD_QUERY_CHUNK_SIZE) {
    const cardIds = entries
      .slice(offset, offset + CARD_QUERY_CHUNK_SIZE)
      .map((entry) => entry.cardId);
    const placeholders = cardIds.map(() => "?").join(", ");
    const chunkRows = await dbAll<{ id: string; raw_json: string }>(
      `SELECT id, raw_json FROM cards WHERE id IN (${placeholders})`,
      cardIds,
    );
    rows.push(...chunkRows);
  }

  const cardsById = new Map<string, Record<string, unknown>>();
  const invalidStoredCardIds = new Set<string>();

  for (const row of rows) {
    const cardId = String(row.id);
    try {
      const card = parsePublicStoredCard(String(row.raw_json));
      delete card.quantity;
      delete card.priceSource;
      cardsById.set(cardId, card);
    } catch (error) {
      invalidStoredCardIds.add(cardId);
      logError(`Failed to parse stored portfolio card ${cardId}`, error);
    }
  }

  const cards: Record<string, unknown>[] = [];
  const missingCardIds: string[] = [];

  for (const entry of entries) {
    const card = cardsById.get(entry.cardId);
    if (!card || invalidStoredCardIds.has(entry.cardId)) {
      missingCardIds.push(entry.cardId);
      continue;
    }

    cards.push({
      ...card,
      id: entry.cardId,
      quantity: entry.quantity,
      ...(entry.priceSource && { priceSource: entry.priceSource }),
    });
  }

  if (missingCardIds.length > 0) {
    const sample = missingCardIds.slice(0, 20).join(", ");
    const remainder =
      missingCardIds.length > 20 ? ` (+${missingCardIds.length - 20} more)` : "";
    console.warn(
      `Portfolio contains ${missingCardIds.length} card reference(s) unavailable in SQL: ${sample}${remainder}. References were left unchanged.`,
    );
  }

  return { cards, missingCardIds };
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

router.get("/cards/hydrated", portfolioReadLimiter, async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const uid = getAuthenticatedUid(res);
    const entries = await getPortfolioEntries(uid);
    const { cards, missingCardIds } = await getHydratedCards(entries);
    res.json({ cards, entries, missingCardIds });
  } catch (error) {
    sendPortfolioError(res, error, "Failed to load hydrated portfolio");
  }
});

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
          entry: toPortfolioEntry(
            cardId,
            existing.data() as Record<string, unknown>,
          ),
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

        const existing = toPortfolioEntry(
          cardId,
          cardSnap.data() as Record<string, unknown>,
        );
        const updatedEntry = { ...existing, quantity };
        transaction.set(cardRef, {
          quantity: updatedEntry.quantity,
          ...(updatedEntry.priceSource && {
            priceSource: updatedEntry.priceSource,
          }),
        });
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

        const existing = toPortfolioEntry(
          cardId,
          cardSnap.data() as Record<string, unknown>,
        );
        const updatedEntry = { ...existing, priceSource };
        transaction.set(cardRef, {
          quantity: updatedEntry.quantity,
          priceSource: updatedEntry.priceSource,
        });
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
