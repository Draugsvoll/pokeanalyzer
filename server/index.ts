import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { dbAll, dbGet } from "./db/db.js";
import grokRoutes from "./db/routes/grokRoutes.js";
import openaiRoutes from "./db/routes/openaiRoutes.js";
import portfolioRoutes from "./db/routes/portfolioRoutes.js";
import { fetchEbayComps } from "./services/ebayCompsApi.js";
import { fetchJustTcgCard, JustTcgApiError } from "./services/justTcgApi.js";
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
  message: { error: "Too many Grok requests. Please wait and try again." },
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
  "/grok",
  requireVerifiedUser,
  grokLimiter,
  express.json({ limit: "28mb" }),
  grokRoutes,
);
app.use(express.json({ limit: "256kb" }));
app.use("/openai", requireVerifiedUser, paidApiLimiter, openaiRoutes);
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
    const statusCode = error instanceof Error && "statusCode" in error ? (error as any).statusCode : 401;
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
    const cards = rows.map((row) => JSON.parse(String(row.raw_json)));
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
    LIMIT 20
  `;

  try {
    const rows = await dbAll<{ raw_json: string }>(sql, params);
    const cards = rows.map((row) => JSON.parse(String(row.raw_json)));
    res.json(cards);
  } catch (err) {
    logError("Card search failed", err);
    res.status(500).json({ error: "Card search failed" });
  }
});

// FETCH SINGLE CARD BY ID
app.get("/api/cards/:id", async (req, res) => {
  try {
    const row = await dbGet<{ raw_json: string }>(
      `
      SELECT raw_json
      FROM cards
      WHERE id = ?
      `,
      [req.params.id],
    );
    if (!row) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json(JSON.parse(String(row.raw_json)));
  } catch (err) {
    logError("Failed to fetch card", err);
    res.status(500).json({ error: "Failed to fetch card" });
  }
});

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
