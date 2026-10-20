import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getCardEbayContext,
  getStoredEbayResponse,
  isCompleteEbayResponse,
  saveCardEbayResponse,
} from "../db/ebayStore.js";
import {
  buildEbayCardRequests,
  fetchEbayComps,
  filterEbayCompsResponseByTitle,
} from "../services/ebayCompsApi.js";
import {
  getAuthenticatedUid,
  requireAuthenticatedUser,
  requireVerifiedUser,
} from "../security/auth.js";
import { logError } from "../security/logging.js";
import {
  getRequestAbortSignal,
  isRequestAbort,
} from "../security/requestAbort.js";
import {
  EbayCreditError,
  getEbayCredits,
  grantEbaySignupCredits,
  runEbayFeature,
} from "./creditService.js";

const ebayLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many eBay requests. Please wait and try again." },
});
const creditsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (_req, res) => String(res.locals.authUid),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many eBay balance requests. Please wait and try again.",
  },
});

const defaultDependencies = {
  getContext: getCardEbayContext,
  fetchComps: fetchEbayComps,
  save: saveCardEbayResponse,
  runFeature: runEbayFeature,
};

export async function requestEbayListings(
  uid: string,
  cardId: unknown,
  signal: AbortSignal,
  dependencies = defaultDependencies,
) {
  const parsedCardId = typeof cardId === "string" ? cardId.trim() : "";
  if (!parsedCardId || parsedCardId.length > 100) {
    throw new EbayCreditError("A valid cardId is required", 400);
  }
  const context = await dependencies.getContext(parsedCardId);
  if (!context?.cardName) {
    throw new EbayCreditError("Card not found", 404);
  }
  const { query, soldOptions, activeOptions } = buildEbayCardRequests(context);
  const cachedResponse = getStoredEbayResponse(context.savedResponses, query);
  if (cachedResponse) {
    const result = await dependencies.runFeature(
      uid,
      async () => ({
        ...cachedResponse,
        active: filterEbayCompsResponseByTitle(
          cachedResponse.active,
          context,
        ),
        sold: filterEbayCompsResponseByTitle(
          cachedResponse.sold,
          context,
        ),
      }),
      signal,
    );
    return { ...result, fromDatabase: true };
  }

  const result = await dependencies.runFeature(
    uid,
    async () => {
      const [soldResult, activeResult] = await Promise.allSettled([
        dependencies.fetchComps(query, signal, soldOptions),
        dependencies.fetchComps(query, signal, activeOptions),
      ]);
      signal.throwIfAborted();
      if (
        soldResult.status === "rejected" &&
        activeResult.status === "rejected"
      ) {
        throw soldResult.reason;
      }
      const response = {
        sold: soldResult.status === "fulfilled" ? soldResult.value : null,
        active: activeResult.status === "fulfilled" ? activeResult.value : null,
        request_query: query,
      };
      if (!isCompleteEbayResponse(response)) {
        // A usable half remains billable, but incomplete results are never cached.
        const hasUsableResult =
          Boolean(response.active || response.sold) &&
          isCompleteEbayResponse({
            active: response.active ?? { items: [] },
            sold: response.sold ?? { items: [] },
          });
        if (!hasUsableResult) {
          throw new EbayCreditError("eBay returned invalid response data", 502);
        }
        return response;
      }
      const storedResponse = await dependencies.save(parsedCardId, response);
      if (!storedResponse) {
        throw new EbayCreditError("eBay returned invalid response data", 502);
      }
      return storedResponse;
    },
    signal,
  );
  return { ...result, fromDatabase: false };
}

export function createEbayRouter({
  getCredits = getEbayCredits,
  grantSignupCredits = grantEbaySignupCredits,
  requestListings = requestEbayListings,
} = {}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post(
    "/signup-credits",
    requireAuthenticatedUser,
    creditsLimiter,
    async (_req, res) => {
      const signal = getRequestAbortSignal(res);
      try {
        const credits = await grantSignupCredits(getAuthenticatedUid(res));
        if (!signal.aborted) res.json({ credits });
      } catch (error) {
        if (isRequestAbort(error, signal)) return;
        logError("eBay signup credit request failed", error);
        const isCreditError = error instanceof EbayCreditError;
        res.status(isCreditError ? error.statusCode : 500).json({
          error: isCreditError
            ? error.message
            : "Failed to grant eBay signup credits",
        });
      }
    },
  );

  router.use(requireVerifiedUser);

  router.get("/credits", creditsLimiter, async (_req, res) => {
    const signal = getRequestAbortSignal(res);
    try {
      const credits = await getCredits(getAuthenticatedUid(res));
      if (!signal.aborted) res.json({ credits });
    } catch (error) {
      if (isRequestAbort(error, signal)) return;
      logError("eBay balance request failed", error);
      const isCreditError = error instanceof EbayCreditError;
      res.status(isCreditError ? error.statusCode : 500).json({
        error: isCreditError ? error.message : "Failed to load eBay credits",
      });
    }
  });

  router.get("/", ebayLimiter, async (req, res) => {
    const signal = getRequestAbortSignal(res);
    try {
      const result = await requestListings(
        getAuthenticatedUid(res),
        req.query.cardId,
        signal,
      );
      if (!signal.aborted) res.json(result);
    } catch (error) {
      if (isRequestAbort(error, signal)) return;
      logError("eBay request failed", error);
      const isCreditError = error instanceof EbayCreditError;
      res.status(isCreditError ? error.statusCode : 502).json({
        error: isCreditError ? error.message : "Failed to fetch eBay listings",
      });
    }
  });

  return router;
}

export default createEbayRouter();
