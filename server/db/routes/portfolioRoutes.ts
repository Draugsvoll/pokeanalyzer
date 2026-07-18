import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { getAuthenticatedUid, requireVerifiedUser } from "../../security/auth.js";
import { logError } from "../../security/logging.js";
import { adminDb } from "../../subscriptions/firebaseAdmin.js";

const router = Router();
const MAX_QUANTITY = 1_000_000;
const CARD_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

class PortfolioHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PortfolioHttpError";
    this.statusCode = statusCode;
  }
}

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
  const quantity = Number(value);
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

function getCardFromDatabase(cardId: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT raw_json FROM cards WHERE id = ?",
      [cardId],
      (error, row: { raw_json: string } | undefined) => {
        if (error) {
          reject(error);
          return;
        }
        if (!row) {
          reject(new PortfolioHttpError("Card not found", 404));
          return;
        }

        try {
          const card: unknown = JSON.parse(row.raw_json);
          if (!card || typeof card !== "object" || Array.isArray(card)) {
            reject(new Error(`Invalid stored card ${cardId}`));
            return;
          }
          resolve(card as Record<string, unknown>);
        } catch (error) {
          reject(error);
        }
      },
    );
  });
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
  res.status(500).json({ message: "Portfolio update failed" });
}

router.use(requireVerifiedUser, portfolioWriteLimiter);

router.post("/cards", async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    const cardId = getCardId(req.body?.cardId);
    const card = await getCardFromDatabase(cardId);

    await portfolioCardRef(uid, cardId).set(card, { merge: true });
    res.status(201).json({ card: { ...card, id: cardId } });
  } catch (error) {
    sendPortfolioError(res, error, "Failed to add portfolio card");
  }
});

router.patch("/cards/:cardId/quantity", async (req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    const cardId = getCardId(req.params.cardId);
    const quantity = getQuantity(req.body?.quantity);
    const cardRef = portfolioCardRef(uid, cardId);
    const cardSnap = await cardRef.get();

    if (!cardSnap.exists) {
      throw new PortfolioHttpError("Portfolio card not found", 404);
    }

    await cardRef.update({ quantity });
    res.json({ cardId, quantity });
  } catch (error) {
    sendPortfolioError(res, error, "Failed to update portfolio quantity");
  }
});

router.delete("/cards/:cardId", async (req, res) => {
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
