import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  isEbayListings,
  type EbayListingType,
  type EbaySearchEvent,
} from "../../shared/ebaySearch.js";
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
  emit?: (event: EbaySearchEvent) => void,
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
  let succeeded = false;
  function publish(side: EbayListingType, data: unknown) {
    signal.throwIfAborted();
    if (!isEbayListings(data)) {
      throw new EbayCreditError("eBay returned invalid response data", 502);
    }
    succeeded = true;
    emit?.({ type: "result", side, data });
    return data;
  }

  const result = await dependencies.runFeature(
    uid,
    async () => {
      if (cachedResponse) {
        return {
          ...cachedResponse,
          sold: publish(
            "sold",
            filterEbayCompsResponseByTitle(cachedResponse.sold, context),
          ),
          active: publish(
            "active",
            filterEbayCompsResponseByTitle(cachedResponse.active, context),
          ),
        };
      }

      async function fetchSide(side: EbayListingType) {
        try {
          const data = await dependencies.fetchComps(
            query,
            signal,
            side === "sold" ? soldOptions : activeOptions,
          );
          return publish(side, data);
        } catch (error) {
          if (!signal.aborted) {
            emit?.({
              type: "failure",
              side,
              message: `We couldn't load eBay ${side === "sold" ? "sales" : "listings"}. Please try again.`,
            });
          }
          throw error;
        }
      }
      const [soldResult, activeResult] = await Promise.allSettled([
        fetchSide("sold"),
        fetchSide("active"),
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
      if (isCompleteEbayResponse(response)) {
        try {
          return (await dependencies.save(parsedCardId, response)) ?? response;
        } catch (error) {
          // Results already succeeded; a cache outage must not discard them.
          logError("Failed to cache eBay results", error);
        }
      }
      return response;
    },
    signal,
    {
      hasSucceeded: () => succeeded,
      onReserved: (credits) => emit?.({ type: "started", credits }),
    },
  );
  return { ...result, fromDatabase: Boolean(cachedResponse) };
}

export function createEbayRouter({
  getCredits = getEbayCredits,
  grantSignupCredits = grantEbaySignupCredits,
  requestListings = requestEbayListings,
} = {}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-transform");
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
    const streaming = req.query.stream === "1";
    const emit = (event: EbaySearchEvent) => {
      if (signal.aborted || res.destroyed || res.writableEnded) return;
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
      }
      res.write(`${JSON.stringify(event)}\n`);
    };
    try {
      const result = await requestListings(
        getAuthenticatedUid(res),
        req.query.cardId,
        signal,
        undefined,
        streaming ? emit : undefined,
      );
      if (!signal.aborted) {
        if (streaming) {
          emit({ type: "complete", credits: result.credits });
          res.end();
        } else {
          res.json(result);
        }
      }
    } catch (error) {
      if (isRequestAbort(error, signal)) return;
      logError("eBay request failed", error);
      const isCreditError = error instanceof EbayCreditError;
      if (res.headersSent) {
        emit({
          type: "error",
          message: "We couldn't complete the eBay search. Please try again.",
        });
        res.end();
        return;
      }
      res.status(isCreditError ? error.statusCode : 502).json({
        error: isCreditError ? error.message : "Failed to fetch eBay listings",
      });
    }
  });

  return router;
}

export default createEbayRouter();
