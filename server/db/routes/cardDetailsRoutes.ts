import { Router, type RequestHandler } from "express";
import { dbGet, type SqlValue } from "../db.js";
import { parsePublicStoredCard } from "../cardSerialization.js";
import { logError } from "../../security/logging.js";
import { assessDefaultCardPrices } from "../../services/defaultPriceReliability.js";

type CardDetailsRow = {
  raw_json: string;
  previous_cardmarket_prices: string | null;
  previous_recorded_at: string | null;
};

type CardDetailsLookup = (
  sql: string,
  params: SqlValue[],
) => Promise<CardDetailsRow | undefined>;

function parsePreviousCardmarketPrices(
  value: string | null,
  cardId: string,
  recordedAt: string | null,
): Record<string, unknown> | null {
  if (value === null) return null;

  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Malformed cardmarket price history for ${cardId} on ${recordedAt ?? "previous snapshot"}`,
    );
  }

  return parsed as Record<string, unknown>;
}

const defaultLookup: CardDetailsLookup = (sql, params) =>
  dbGet<CardDetailsRow>(sql, params);

export async function loadCardDetails(
  cardId: string,
  lookup: CardDetailsLookup = defaultLookup,
) {
  const row = await lookup(
    `
    SELECT
      cards.raw_json,
      previous.cardmarket_prices AS previous_cardmarket_prices,
      previous.recorded_at AS previous_recorded_at
    FROM cards
    LEFT JOIN (
      SELECT recorded_at, cardmarket_prices
      FROM price_snapshots
      WHERE card_id = ?
      ORDER BY recorded_at DESC, id DESC
      LIMIT 1 OFFSET 1
    ) AS previous
      ON TRUE
    WHERE cards.id = ?
    `,
    [cardId, cardId],
  );
  if (!row) return null;

  const card = parsePublicStoredCard(String(row.raw_json));
  const previousCardmarketPrices = parsePreviousCardmarketPrices(
    row.previous_cardmarket_prices,
    cardId,
    row.previous_recorded_at,
  );

  return {
    ...card,
    priceReliability: assessDefaultCardPrices(card, previousCardmarketPrices),
  };
}

type CardDetailsHandlerDependencies = {
  loadDetails: (cardId: string) => ReturnType<typeof loadCardDetails>;
  reportError: (context: string, error: unknown) => void;
};

export function createCardDetailsHandler(
  dependencies: Partial<CardDetailsHandlerDependencies> = {},
): RequestHandler {
  const loadDetails = dependencies.loadDetails ?? loadCardDetails;
  const reportError = dependencies.reportError ?? logError;

  return async (req, res) => {
    try {
      const cardId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const card = cardId ? await loadDetails(cardId) : null;
      if (!card) {
        res.status(404).json({ error: "Card not found" });
        return;
      }
      res.json(card);
    } catch (error) {
      reportError("Failed to fetch card", error);
      res.status(500).json({ error: "Failed to fetch card" });
    }
  };
}

const router = Router();
router.get("/:id", createCardDetailsHandler());

export default router;
