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
import { parsePokeTraceMarketComparisons } from "../../../shared/pokeTraceMarketComparisons.js";

type PortfolioEntry = { cardId: string; quantity: number };

const router = Router();
const MAX_QUANTITY = 1_000_000;
const CARD_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
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

function getCardId(value: unknown) {
  const cardId = typeof value === "string" ? value.trim() : "";
  if (!CARD_ID_PATTERN.test(cardId)) {
    throw new PortfolioHttpError("Invalid card ID", 400);
  }
  return cardId;
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

function parseEntry(cardId: string, value: unknown): PortfolioEntry {
  const fields =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return { cardId: getCardId(cardId), quantity: getQuantity(fields.quantity) };
}

function portfolioCollection(uid: string) {
  return adminDb.collection(`users/${uid}/portfolio`);
}

function portfolioCardRef(uid: string, cardId: string) {
  return adminDb.doc(`users/${uid}/portfolio/${cardId}`);
}

async function getPortfolioEntries(uid: string) {
  const snapshot = await portfolioCollection(uid).get();
  return snapshot.docs.map((document) =>
    parseEntry(document.id, document.data()),
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

router.use(requireVerifiedUser);

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
    await requireLocalCard(cardId);
    const cardRef = portfolioCardRef(uid, cardId);
    const result = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(cardRef);
      if (existing.exists) {
        return { created: false, entry: parseEntry(cardId, existing.data()) };
      }
      const entry = { cardId, quantity: 1 };
      transaction.create(cardRef, { quantity: 1 });
      return { created: true, entry };
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    sendError(res, error, "Failed to add portfolio card");
  }
});

router.patch("/cards/:cardId/quantity", writeLimiter, async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    const cardId = getCardId(req.params.cardId);
    const quantity = getQuantity(req.body?.quantity);
    const cardRef = portfolioCardRef(uid, cardId);
    const entry = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(cardRef);
      if (!existing.exists) {
        throw new PortfolioHttpError("Portfolio card not found", 404);
      }
      transaction.update(cardRef, { quantity });
      return { cardId, quantity };
    });
    res.json(entry);
  } catch (error) {
    sendError(res, error, "Failed to update portfolio quantity");
  }
});

router.delete("/cards/:cardId", writeLimiter, async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    await portfolioCardRef(uid, getCardId(req.params.cardId)).delete();
    res.status(204).send();
  } catch (error) {
    sendError(res, error, "Failed to remove portfolio card");
  }
});

export default router;
