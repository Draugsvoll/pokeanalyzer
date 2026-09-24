import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import grokRoutes from "./db/routes/grokRoutes.js";
import marketCategoryRoutes from "./db/routes/marketCategoryRoutes.js";
import newsRoutes from "./db/routes/newsRoutes.js";
import openaiRoutes from "./db/routes/openaiRoutes.js";
import portfolioRoutes from "./db/routes/portfolioRoutes.js";
import pokeTraceRoutes from "./db/routes/pokeTraceRoutes.js";
import {
  buildEbayCardRequests,
  fetchEbayComps,
  filterEbayCompsResponseByTitle,
} from "./services/ebayCompsApi.js";
import subscriptionRoutes from "./subscriptions/subscriptionRoutes.js";
import { stripeWebhookHandler } from "./subscriptions/stripePayments.js";
import { getAuthenticatedUid, requireVerifiedUser } from "./security/auth.js";
import { getSafeErrorDetails, logError } from "./security/logging.js";
import {
  CreditHttpError,
  runPaidFeature,
} from "./subscriptions/creditService.js";
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
import { ensurePokeTraceReady, pokeTraceDb } from "./db/pokeTraceDb.js";
import { checkDatabaseConnection } from "./db/db.js";

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

const cardCatalogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many catalog requests. Please wait and try again." },
});

const cardPriceHistoryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many price-history requests. Please wait and try again.",
  },
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
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["DELETE", "GET", "PATCH", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Stripe-Signature"],
    maxAge: 86400,
  }),
);
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
app.use("/api/market-categories", marketCategoryRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/cards/catalog", cardCatalogLimiter);
app.use("/api/cards/:id/market-price-history", cardPriceHistoryLimiter);
app.use(
  "/api/cards",
  (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
  pokeTraceRoutes,
);

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
    const message =
      error instanceof Error ? error.message : "Authentication failed";
    res.status(statusCode).json({ message });
  }
});

function isCompleteEbayResponse(
  value: Record<string, unknown> | null,
): value is Record<string, unknown> & { active: object; sold: object } {
  return Boolean(
    value &&
    value.active &&
    typeof value.active === "object" &&
    value.sold &&
    typeof value.sold === "object",
  );
}

app.get("/ebay", requireVerifiedUser, ebayLimiter, async (req, res) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const cardId =
      typeof req.query.cardId === "string" ? req.query.cardId.trim() : "";
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
    const ebayRequests = buildEbayCardRequests(context);
    if (
      isCompleteEbayResponse(context.storedResponse) &&
      context.storedResponse.request_query === ebayRequests.query
    ) {
      const storedResponse = {
        ...context.storedResponse,
        active: filterEbayCompsResponseByTitle(
          context.storedResponse.active,
          context.cardName,
        ),
        sold: filterEbayCompsResponseByTitle(
          context.storedResponse.sold,
          context.cardName,
        ),
      };
      const storedResult = await runPaidFeature(
        uid,
        "ebay_sold",
        async () => storedResponse,
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
        const { query, soldOptions, activeOptions } = ebayRequests;
        const [soldResult, activeResult] = await Promise.allSettled([
          fetchEbayComps(query, signal, soldOptions),
          fetchEbayComps(query, signal, activeOptions),
        ]);
        if (
          soldResult.status === "rejected" &&
          activeResult.status === "rejected"
        ) {
          throw soldResult.reason;
        }
        const response = {
          sold: soldResult.status === "fulfilled" ? soldResult.value : null,
          active:
            activeResult.status === "fulfilled" ? activeResult.value : null,
          request_query: query,
        };
        if (!isCompleteEbayResponse(response)) return response;

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
    const statusCode =
      error instanceof CreditHttpError ? error.statusCode : 502;
    const message =
      error instanceof CreditHttpError
        ? error.message
        : "Failed to fetch eBay listings";
    res.status(statusCode).json({ error: message });
  }
});

const PORT = process.env.PORT || 3001;

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  logError("Unhandled request error", error);
  const details = getSafeErrorDetails(error) as {
    status?: number;
    statusCode?: number;
  };
  const statusCode =
    details.status === 413 || details.statusCode === 413 ? 413 : 400;
  res.status(statusCode).json({
    error: statusCode === 413 ? "Request body is too large" : "Invalid request",
  });
};

app.use(errorHandler);

async function startServer() {
  try {
    await checkDatabaseConnection();
    await ensurePokeTraceReady();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logError("Failed to initialize PokeTrace database", error);
    pokeTraceDb.close();
    process.exitCode = 1;
  }
}

void startServer();
