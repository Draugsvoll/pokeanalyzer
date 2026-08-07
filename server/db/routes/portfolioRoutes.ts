import { Router, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { dbAll, dbGet, dbRun } from "../db.js";
import {
  parsePublicStoredCard,
  parseStoredCard,
} from "../cardSerialization.js";
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
import {
  fetchJustTcgCardIdentityCandidates,
  fetchJustTcgPortfolioPricesByCardIds,
  JustTcgApiError,
} from "../../services/justTcgApi.js";
import {
  getRequestAbortSignal,
  isRequestAbort,
} from "../../security/requestAbort.js";
import { isVerifiedJustTcgCard } from "../../../shared/justTcgCardVerification.js";

const router = Router();
const MAX_QUANTITY = 1_000_000;
const CARD_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const PRICE_KEY_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const JUST_TCG_PRICE_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,240}$/;
const CARD_QUERY_CHUNK_SIZE = 400;
const JUST_TCG_LOOKUP_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

type PortfolioEntry = {
  cardId: string;
  quantity: number;
  priceSources?: Partial<Record<PortfolioPriceSource, string>>;
};

type PortfolioPriceSource = "tcgplayer" | "cardmarket" | "justtcg";

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

const portfolioJustTcgLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many JustTCG lookups. Please wait and try again.",
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

function isPortfolioPriceSource(value: unknown): value is PortfolioPriceSource {
  return value === "tcgplayer" || value === "cardmarket" || value === "justtcg";
}

function getPriceKey(value: unknown, priceSource: PortfolioPriceSource) {
  const priceKey = typeof value === "string" ? value.trim() : "";
  const pattern =
    priceSource === "justtcg" ? JUST_TCG_PRICE_KEY_PATTERN : PRICE_KEY_PATTERN;
  if (!pattern.test(priceKey)) {
    throw new PortfolioHttpError(
      "priceKey must be a valid price source key",
      400,
    );
  }
  return priceKey;
}

function getPortfolioPriceSource(value: unknown): PortfolioPriceSource {
  if (isPortfolioPriceSource(value)) return value;
  throw new PortfolioHttpError(
    "priceSource must be tcgplayer, cardmarket, or justtcg",
    400,
  );
}

function parseStoredPortfolioPriceSource(value: unknown): PortfolioPriceSource {
  return isPortfolioPriceSource(value) ? value : "tcgplayer";
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
    (field) => field !== "quantity" && field !== "priceSources",
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

  const priceSources: Partial<Record<PortfolioPriceSource, string>> = {};
  if (fields.priceSources !== undefined) {
    if (
      !fields.priceSources ||
      typeof fields.priceSources !== "object" ||
      Array.isArray(fields.priceSources)
    ) {
      throw new Error(`Portfolio entry ${cardId} has invalid price sources`);
    }

    const storedPriceSources = fields.priceSources as Record<string, unknown>;
    const unexpectedPriceSources = Object.keys(storedPriceSources).filter(
      (field) => !isPortfolioPriceSource(field),
    );
    if (unexpectedPriceSources.length > 0) {
      throw new Error(
        `Portfolio entry ${cardId} has unsupported price sources`,
      );
    }

    for (const source of ["tcgplayer", "cardmarket", "justtcg"] as const) {
      const value = storedPriceSources[source];
      if (value === undefined) continue;
      const pattern =
        source === "justtcg" ? JUST_TCG_PRICE_KEY_PATTERN : PRICE_KEY_PATTERN;
      if (typeof value !== "string" || !pattern.test(value.trim())) {
        throw new Error(
          `Portfolio entry ${cardId} has an invalid ${source} price key`,
        );
      }
      priceSources[source] = value.trim();
    }
  }

  return {
    cardId,
    quantity,
    ...(Object.keys(priceSources).length > 0 && { priceSources }),
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

type StoredJustTcgLookup = {
  failedAt?: string;
  ids: string[];
};

function parseStoredJustTcgLookup(value: unknown): StoredJustTcgLookup {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ids: [] };
  }

  const fields = value as Record<string, unknown>;
  return {
    failedAt:
      typeof fields.failedAt === "string" && fields.failedAt.trim()
        ? fields.failedAt.trim()
        : undefined,
    ids: Array.isArray(fields.ids)
      ? fields.ids
          .filter(
            (id): id is string =>
              typeof id === "string" && id.trim().length > 0,
          )
          .map((id) => id.trim())
      : [],
  };
}

function shouldRetryJustTcgLookup(failedAt?: string) {
  if (!failedAt) return true;
  const failedTime = Date.parse(failedAt);
  return (
    !Number.isFinite(failedTime) ||
    Date.now() - failedTime >= JUST_TCG_LOOKUP_RETRY_MS
  );
}

async function getStoredCardForJustTcgLookup(cardId: string) {
  return dbGet<{
    name: string;
    number: string | null;
    raw_json: string;
    set_name: string | null;
  }>(
    `
      SELECT name, number, set_name, raw_json
      FROM cards
      WHERE id = ?
    `,
    [cardId],
  );
}

async function saveJustTcgLookup(cardId: string, lookup: StoredJustTcgLookup) {
  await dbRun(
    `
      UPDATE cards
      SET raw_json = json_set(raw_json, '$.justtcgLookup', json(?)),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [JSON.stringify(lookup), cardId],
  );
}

function getStoredJustTcgLookup(rawJson: string) {
  return parseStoredJustTcgLookup(parseStoredCard(rawJson).justtcgLookup);
}

function buildJustTcgPayload(
  prices: Record<string, unknown>,
): { prices: Record<string, unknown> } | null {
  return Object.keys(prices).length > 0 ? { prices } : null;
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
    delete card.priceSources;
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
      ...(entry.priceSources && { priceSources: entry.priceSources }),
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

router.get("/cards/justtcg-prices", portfolioReadLimiter, async (_req, res) => {
  const signal = getRequestAbortSignal(res);
  res.setHeader("Cache-Control", "private, no-store");

  try {
    const uid = getAuthenticatedUid(res);
    const entries = await getPortfolioEntries(uid);
    const localCardIds = entries.map((entry) => entry.cardId);

    if (localCardIds.length === 0) {
      res.json({ cards: [], missingCardIds: [] });
      return;
    }

    const rows: Array<{ id: string; raw_json: string }> = [];
    for (
      let offset = 0;
      offset < localCardIds.length;
      offset += CARD_QUERY_CHUNK_SIZE
    ) {
      const cardIds = localCardIds.slice(
        offset,
        offset + CARD_QUERY_CHUNK_SIZE,
      );
      rows.push(
        ...(await dbAll<{ id: string; raw_json: string }>(
          `
            SELECT id, raw_json
            FROM cards
            WHERE id IN (${cardIds.map(() => "?").join(", ")})
          `,
          cardIds,
        )),
      );
    }
    const lookupIdsByCardId = new Map<string, string[]>();
    const requestedJustTcgIds = new Set<string>();

    for (const row of rows) {
      const lookup = getStoredJustTcgLookup(String(row.raw_json));
      if (lookup.ids.length === 0) continue;

      lookupIdsByCardId.set(String(row.id), lookup.ids);
      for (const id of lookup.ids) requestedJustTcgIds.add(id);
    }

    const justTcgIds = Array.from(requestedJustTcgIds);
    const pricesByJustTcgKey =
      await fetchJustTcgPortfolioPricesByCardIds(justTcgIds, signal);

    const hydratedCards = localCardIds.map((cardId) => {
      const prices: Record<string, unknown> = {};
      const lookupIds = lookupIdsByCardId.get(cardId) ?? [];

      for (const justTcgId of lookupIds) {
        for (const [key, value] of Object.entries(pricesByJustTcgKey)) {
          if (key.startsWith(`${justTcgId}:`)) {
            prices[key] = value;
          }
        }
      }

      return {
        cardId,
        justtcg: buildJustTcgPayload(prices),
      };
    });

    res.json({
      cards: hydratedCards,
      missingCardIds: hydratedCards
        .filter((card) => card.justtcg === null)
        .map((card) => card.cardId),
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("Failed to load portfolio JustTCG prices", error);
    const statusCode =
      error instanceof JustTcgApiError && error.statusCode === 429 ? 429 : 502;
    res.status(statusCode).json({ message: "Failed to load JustTCG prices" });
  }
});

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

router.post(
  "/cards/:cardId/justtcg-lookup",
  portfolioJustTcgLookupLimiter,
  async (req, res) => {
    const signal = getRequestAbortSignal(res);

    try {
      const uid = getAuthenticatedUid(res);
      const cardId = getCardId(req.params.cardId);
      const [portfolioCard, storedCard] = await Promise.all([
        portfolioCardRef(uid, cardId).get(),
        getStoredCardForJustTcgLookup(cardId),
      ]);

      if (!portfolioCard.exists) {
        throw new PortfolioHttpError("Portfolio card not found", 404);
      }
      if (!storedCard) {
        throw new PortfolioHttpError("Card not found", 404);
      }

      const existingLookup = getStoredJustTcgLookup(
        String(storedCard.raw_json),
      );
      if (existingLookup.ids.length > 0) {
        res.json({ status: "ready", ids: existingLookup.ids });
        return;
      }
      if (!shouldRetryJustTcgLookup(existingLookup.failedAt)) {
        res.json({
          status: "recently_failed",
          failedAt: existingLookup.failedAt,
          ids: [],
        });
        return;
      }

      const setName = storedCard.set_name?.trim();
      const number = storedCard.number?.trim();
      if (!setName || !number) {
        const lookup = { failedAt: new Date().toISOString(), ids: [] };
        await saveJustTcgLookup(cardId, lookup);
        res.json({ status: "failed", ...lookup });
        return;
      }

      const candidates = await fetchJustTcgCardIdentityCandidates(
        storedCard.name,
        number,
        signal,
      );
      const ids = Array.from(
        new Set(
          candidates
            .filter((candidate) =>
              isVerifiedJustTcgCard(candidate, setName, number),
            )
            .map((candidate) => candidate.id),
        ),
      );

      if (ids.length > 0) {
        const lookup = { ids };
        await saveJustTcgLookup(cardId, lookup);
        res.json({ status: "ready", ids });
        return;
      }

      const lookup = { failedAt: new Date().toISOString(), ids: [] };
      await saveJustTcgLookup(cardId, lookup);
      res.json({ status: "failed", ...lookup });
    } catch (error) {
      if (isRequestAbort(error, signal)) return;
      if (error instanceof JustTcgApiError) {
        const statusCode = error.statusCode === 429 ? 429 : 502;
        res.status(statusCode).json({ message: "JustTCG lookup failed" });
        return;
      }

      sendPortfolioError(res, error, "Failed to look up JustTCG card IDs");
    }
  },
);

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
      const priceSource = getPortfolioPriceSource(req.body?.priceSource);
      const priceKey = getPriceKey(req.body?.priceKey, priceSource);
      const cardRef = portfolioCardRef(uid, cardId);

      const entry = await adminDb.runTransaction(async (transaction) => {
        const cardSnap = await transaction.get(cardRef);
        if (!cardSnap.exists) {
          throw new PortfolioHttpError("Portfolio card not found", 404);
        }

        const existing = parseStoredPortfolioEntry(cardId, cardSnap.data());
        const priceSources = {
          ...(existing.priceSources ?? {}),
          [priceSource]: priceKey,
        };
        const updatedEntry = { ...existing, priceSources };
        transaction.update(cardRef, {
          [`priceSources.${priceSource}`]: priceKey,
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
