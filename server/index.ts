import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { dbAll, dbGet } from "./db/db.js";
import grokRoutes from "./db/routes/grokRoutes.js";
import newsRoutes from "./db/routes/newsRoutes.js";
import openaiRoutes from "./db/routes/openaiRoutes.js";
import portfolioRoutes from "./db/routes/portfolioRoutes.js";
import cardDetailsRoutes from "./db/routes/cardDetailsRoutes.js";
import { fetchEbayComps } from "./services/ebayCompsApi.js";
import {
  fetchJustTcgBiggestGainers,
  fetchJustTcgBiggestLosers,
  fetchJustTcgCard,
  type JustTcgMovementPeriod,
  type JustTcgPriceMovement,
  JustTcgApiError,
} from "./services/justTcgApi.js";
import subscriptionRoutes from "./subscriptions/subscriptionRoutes.js";
import { stripeWebhookHandler } from "./subscriptions/stripePayments.js";
import { getAuthenticatedUid, requireVerifiedUser } from "./security/auth.js";
import { getSafeErrorDetails, logError } from "./security/logging.js";
import { CreditHttpError, runPaidFeature } from "./subscriptions/creditService.js";
import {
  attachRequestAbortSignal,
  getRequestAbortSignal,
  isRequestAbort,
} from "./security/requestAbort.js";
import { CARD_GROK_FEATURES } from "./db/cardGrokConfig.js";
import {
  getCardGrokContext,
  saveCardGrokResponse,
} from "./db/cardGrokStore.js";
import { parsePublicStoredCard } from "./db/cardSerialization.js";

const app = express();
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? APP_URL)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const trustProxySetting = process.env.TRUST_PROXY?.trim();

if (trustProxySetting === "true") {
  app.set("trust proxy", 1);
} else if (trustProxySetting && /^\d+$/.test(trustProxySetting)) {
  app.set("trust proxy", Number(trustProxySetting));
}

app.disable("x-powered-by");

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200, // per minutt
  standardHeaders: true,
  legacyHeaders: false,
});

const ebayLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many eBay requests. Please wait and try again." },
});

const grokLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait and try again." },
});

const paidApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many paid API requests. Please wait and try again." },
});

app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  methods: ["DELETE", "GET", "PATCH", "POST", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "Stripe-Signature"],
  maxAge: 86400,
}));
app.post(
  "/api/subscription/stripe/webhook",
  express.raw({ type: "application/json", limit: "256kb" }),
  stripeWebhookHandler,
);
app.use((req, res, next) => {
  // Skip rate limiter for webhook endpoint to preserve raw body for signature verification
  if (req.path === "/api/subscription/stripe/webhook") {
    return next();
  }
  limiter(req, res, next);
});
app.use(attachRequestAbortSignal);
app.use(
  "/ai",
  requireVerifiedUser,
  grokLimiter,
  express.json({ limit: "28mb" }),
  grokRoutes,
);
app.use(express.json({ limit: "256kb" }));
app.use("/openai", requireVerifiedUser, paidApiLimiter, openaiRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/subscription", subscriptionRoutes);

app.get("/api/admin/check", requireVerifiedUser, (_req, res) => {
  try {
    const uid = getAuthenticatedUid(res);
    const adminUid = process.env.ADMIN_UID?.trim();

    if (!adminUid) {
      res.status(500).json({ message: "Admin UID not configured" });
      return;
    }

    if (uid === adminUid) {
      res.status(200).json({ isAdmin: true });
    } else {
      res.status(403).json({ message: "Not an admin" });
    }
  } catch (error) {
    const possibleStatusCode =
      error instanceof Error && "statusCode" in error
        ? (error as { statusCode?: unknown }).statusCode
        : undefined;
    const statusCode =
      typeof possibleStatusCode === "number" ? possibleStatusCode : 401;
    const message = error instanceof Error ? error.message : "Authentication failed";
    res.status(statusCode).json({ message });
  }
});

app.get("/ebay", requireVerifiedUser, ebayLimiter, async (req, res) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const cardId = typeof req.query.cardId === "string" ? req.query.cardId.trim() : "";
    if (!cardId || cardId.length > 100) {
      throw new CreditHttpError("A valid cardId is required", 400);
    }

    const feature = CARD_GROK_FEATURES.ebay_sold;
    const context = await getCardGrokContext(
      cardId,
      feature.storageKey,
      feature.reuseDays,
    );
    if (!context || !context.cardNameAndSet) {
      throw new CreditHttpError("Card not found", 404);
    }
    if (context.storedResponse) {
      const storedResult = await runPaidFeature(
        uid,
        "ebay_sold",
        async () => context.storedResponse,
        signal,
      );
      res.json({
        ...storedResult,
        fromDatabase: true,
      });
      return;
    }

    const result = await runPaidFeature(
      uid,
      "ebay_sold",
      async () => {
        const ebayQuery = [
          context.cardNameAndSet,
          context.rarity,
          context.cardNumber,
        ].filter(Boolean).join(" ");
        const response = await fetchEbayComps(ebayQuery, signal);
        const storedResponse = await saveCardGrokResponse(
          cardId,
          feature.storageKey,
          response,
        );
        if (!storedResponse) {
          throw new CreditHttpError("eBay returned invalid response data", 502);
        }
        return storedResponse;
      },
      signal,
    );

    res.json({ ...result, fromDatabase: false });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("eBay request failed", error);
    const statusCode = error instanceof CreditHttpError ? error.statusCode : 502;
    const message = error instanceof CreditHttpError
      ? error.message
      : "Failed to fetch eBay sold listings";
    res.status(statusCode).json({ error: message });
  }
});

app.use("/api/cards", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// FETCH ALL CARDS
app.get("/api/cards", async (_req, res) => {
  try {
    const rows = await dbAll<{ raw_json: string }>(
      `
      SELECT raw_json
      FROM cards
      LIMIT 10
      `,
    );
    const cards = rows.map((row) => parsePublicStoredCard(String(row.raw_json)));
    res.json(cards);
  } catch (err) {
    logError("Failed to fetch cards", err);
    res.status(500).json({ error: "Failed to fetch cards" });
  }
});

app.get("/api/justtcg-card", requireVerifiedUser, paidApiLimiter, async (req, res) => {
  const signal = getRequestAbortSignal(res);
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  const number = typeof req.query.number === "string" ? req.query.number.trim() : "";

  if (!name || !number) {
    res.status(400).json({ message: "name and number are required" });
    return;
  }

  try {
    const result = await fetchJustTcgCard(name, number, signal);
    res.json(result);
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("JustTCG API request failed", error);
    const statusCode = error instanceof JustTcgApiError && error.statusCode === 429
      ? 429
      : 502;
    res.status(statusCode).json({ message: "JustTCG API request failed" });
  }
});

function formatJustTcgPriceKey(priceMovement: JustTcgPriceMovement) {
  return [priceMovement.printing, priceMovement.condition]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatJustTcgPriceData(priceMovement: JustTcgPriceMovement) {
  const percentChangeKey =
    `percentChange${priceMovement.period}` as const;
  const absoluteChangeKey =
    `absoluteChange${priceMovement.period}` as const;

  return {
    [absoluteChangeKey]: priceMovement.absoluteChange,
    condition: priceMovement.condition,
    market: priceMovement.currentPrice,
    [percentChangeKey]: priceMovement.changePercent,
    printing: priceMovement.printing,
  };
}

function formatJustTcgCardData(
  card: Record<string, unknown>,
  priceMovement: JustTcgPriceMovement,
) {
  const key = formatJustTcgPriceKey(priceMovement) || "justtcg";

  return {
    ...card,
    justtcg: {
      prices: {
        [key]: formatJustTcgPriceData(priceMovement),
      },
    },
  };
}

function findUniqueJustTcgMoverCard(rows: { raw_json: string }[]) {
  return rows.length === 1 ? rows[0] : null;
}

function registerJustTcgMoversRoute(
  path: string,
  fetchMovers: (
    signal?: AbortSignal,
    period?: JustTcgMovementPeriod,
  ) => Promise<JustTcgPriceMovement[]>,
) {
  app.get(path, async (req, res) => {
    const signal = getRequestAbortSignal(res);
    const periodQuery =
      typeof req.query.period === "string" ? req.query.period : "7d";

    if (!["24h", "7d", "30d"].includes(periodQuery)) {
      res.status(400).json({ message: "Invalid JustTCG movement period" });
      return;
    }

    try {
      const priceMovements = await fetchMovers(
        signal,
        periodQuery as JustTcgMovementPeriod,
      );
      const cards = await Promise.all(
        priceMovements.map(async (priceMovement) => {
          const rows = await dbAll<{ raw_json: string }>(
            `
              SELECT raw_json
              FROM cards
              WHERE name = ?
                AND (? IS NULL OR set_name = ?)
              LIMIT 2
            `,
            [
              priceMovement.cardName,
              priceMovement.setName ?? null,
              priceMovement.setName ?? null,
            ],
          );
          const matchedRow = findUniqueJustTcgMoverCard(rows);
          const card = matchedRow
            ? parsePublicStoredCard(String(matchedRow.raw_json))
            : null;

          return card
            ? {
                card: formatJustTcgCardData(card, priceMovement),
                mover: priceMovement,
              }
            : null;
        }),
      );

      res.setHeader("Cache-Control", "no-store");
      res.json({
        cards: cards.filter((item): item is NonNullable<typeof item> =>
          Boolean(item),
        ),
      });
    } catch (error) {
      if (isRequestAbort(error, signal)) return;
      logError("JustTCG biggest movers request failed", error);
      const statusCode = error instanceof JustTcgApiError ? error.statusCode : 502;
      res.status(statusCode).json({
        message:
          error instanceof JustTcgApiError
            ? error.message
            : "JustTCG biggest movers request failed",
      });
    }
  });
}

registerJustTcgMoversRoute("/api/justtcg/biggest-gainers", fetchJustTcgBiggestGainers);
registerJustTcgMoversRoute("/api/justtcg/biggest-losers", fetchJustTcgBiggestLosers);

// SEARCH FUNCTION
app.get("/api/cards/search", async (req, res) => {
  const pokemonName =
    typeof req.query.pokemonName === "string" ? req.query.pokemonName.trim() : "";
  const setName =
    typeof req.query.setName === "string" ? req.query.setName.trim() : "";
  const setSeries =
    typeof req.query.setSeries === "string" ? req.query.setSeries.trim() : "";
  const cardNumber =
    typeof req.query.cardNumber === "string" ? req.query.cardNumber.trim() : "";
  const rarity =
    typeof req.query.rarity === "string" ? req.query.rarity.trim() : "";
  const nationalPokedexNumbers =
    typeof req.query.nationalPokedexNumbers === "string"
      ? req.query.nationalPokedexNumbers.trim()
      : "";
  const cardId =
    typeof req.query.cardId === "string" ? req.query.cardId.trim() : "";
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (pokemonName) {
    conditions.push("name LIKE ?");
    params.push(`%${pokemonName}%`);
  }

  if (setName) {
    conditions.push("set_name LIKE ?");
    params.push(`%${setName}%`);
  }

  if (setSeries) {
    conditions.push("json_extract(raw_json, '$.set.series') LIKE ?");
    params.push(`%${setSeries}%`);
  }

  if (cardNumber) {
    conditions.push("number = ?");
    params.push(cardNumber);
  }

  if (rarity) {
    conditions.push("json_extract(raw_json, '$.rarity') LIKE ?");
    params.push(`%${rarity}%`);
  }

  if (nationalPokedexNumbers) {
    const pokedexNumber = Number(nationalPokedexNumbers);

    if (!Number.isNaN(pokedexNumber)) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM json_each(cards.raw_json, '$.nationalPokedexNumbers')
          WHERE json_each.value = ?
        )
      `);
      params.push(pokedexNumber);
    }
  }

  if (cardId) {
    conditions.push("id LIKE ?");
    params.push(`%${cardId}%`);
  }

  if (conditions.length === 0) {
    res.status(400).json({ error: "At least one search field is required" });
    return;
  }

  const sql = `
    SELECT raw_json
    FROM cards
    WHERE ${conditions.join(" AND ")}
    LIMIT 50
  `;

  try {
    const rows = await dbAll<{ raw_json: string }>(sql, params);
    const cards = rows.map((row) => parsePublicStoredCard(String(row.raw_json)));
    res.json(cards);
  } catch (err) {
    logError("Card search failed", err);
    res.status(500).json({ error: "Card search failed" });
  }
});

type PriceHistoryRow = {
  recorded_at: string;
  tcgplayer_prices: string | null;
  cardmarket_prices: string | null;
  tcgplayer_updated_at: string | null;
  cardmarket_updated_at: string | null;
};

function parseSnapshotPrices(
  value: string | null,
  cardId: string,
  recordedAt: string,
  provider: "tcgplayer" | "cardmarket",
) {
  if (value == null) return null;
  const parsed: unknown = JSON.parse(String(value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Malformed ${provider} price history for ${cardId} on ${recordedAt}`,
    );
  }
  return parsed;
}

app.get("/api/cards/:id/price-history", async (req, res) => {
  const rawDays = req.query.days ?? "7";
  const days = Number(rawDays);
  if (!Number.isSafeInteger(days) || days < 1 || days > 30) {
    res.status(400).json({ error: "days must be an integer between 1 and 30" });
    return;
  }

  try {
    const card = await dbGet<{ id: string }>(
      "SELECT id FROM cards WHERE id = ?",
      [req.params.id],
    );
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    const rows = await dbAll<PriceHistoryRow>(
      `
      SELECT
        recorded_at,
        tcgplayer_prices,
        cardmarket_prices,
        tcgplayer_updated_at,
        cardmarket_updated_at
      FROM (
        SELECT
          recorded_at,
          tcgplayer_prices,
          cardmarket_prices,
          tcgplayer_updated_at,
          cardmarket_updated_at
        FROM price_snapshots
        WHERE card_id = ?
        ORDER BY recorded_at DESC
        LIMIT ?
      )
      ORDER BY recorded_at ASC
      `,
      [req.params.id, days],
    );

    res.json({
      cardId: req.params.id,
      days,
      snapshots: rows.map((row) => ({
        recordedAt: String(row.recorded_at),
        tcgplayerPrices: parseSnapshotPrices(
          row.tcgplayer_prices,
          req.params.id,
          String(row.recorded_at),
          "tcgplayer",
        ),
        cardmarketPrices: parseSnapshotPrices(
          row.cardmarket_prices,
          req.params.id,
          String(row.recorded_at),
          "cardmarket",
        ),
        tcgplayerUpdatedAt: row.tcgplayer_updated_at == null
          ? null
          : String(row.tcgplayer_updated_at),
        cardmarketUpdatedAt: row.cardmarket_updated_at == null
          ? null
          : String(row.cardmarket_updated_at),
      })),
    });
  } catch (err) {
    logError("Failed to fetch card price history", err);
    res.status(500).json({ error: "Failed to fetch card price history" });
  }
});

app.use("/api/cards", cardDetailsRoutes);

const PORT = process.env.PORT || 3001;

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  logError("Unhandled request error", error);
  const details = getSafeErrorDetails(error) as { status?: number; statusCode?: number };
  const statusCode = details.status === 413 || details.statusCode === 413 ? 413 : 400;
  res.status(statusCode).json({
    error: statusCode === 413 ? "Request body is too large" : "Invalid request",
  });
};

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
