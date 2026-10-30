import type {
  MarketplaceSearchEvent,
  MarketplaceSide,
} from "../../shared/marketplaceSearch.js";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { isTcgCondition, type TcgSnapshot } from "../../shared/tcgExplorer.js";
import { EbayCreditError, runEbayFeature } from "../ebay/creditService.js";
import { getAuthenticatedUid, requireVerifiedUser } from "../security/auth.js";
import {
  getRequestAbortSignal,
  isRequestAbort,
} from "../security/requestAbort.js";
import { logError } from "../security/logging.js";
import {
  fetchTcgOffers,
  fetchTcgSales,
  getTcgApiConfig,
} from "../services/tcgCompsApi.js";
import {
  getCachedTcgSnapshot,
  getTcgCardContext,
  saveTcgSnapshot,
} from "./store.js";

const dependencies = {
  getContext: getTcgCardContext,
  save: saveTcgSnapshot,
  getConfig: getTcgApiConfig,
  fetchSales: fetchTcgSales,
  fetchOffers: fetchTcgOffers,
  runFeature: runEbayFeature,
};
export async function requestTcgExplorer(
  uid: string,
  input: { cardId?: unknown; condition?: unknown; language?: unknown },
  signal: AbortSignal,
  deps = dependencies,
  emit?: (event: MarketplaceSearchEvent<TcgSnapshot>) => void,
) {
  const { cardId, condition, language } = input;
  if (
    typeof cardId !== "string" ||
    !cardId.trim() ||
    cardId.length > 100 ||
    !isTcgCondition(condition) ||
    language !== "English"
  ) {
    throw new EbayCreditError("Invalid TCG Explorer filters", 400);
  }
  const card = await deps.getContext(cardId);
  if (!card) throw new EbayCreditError("Card not found", 404);
  if (!Number.isSafeInteger(card.productId) || card.productId <= 0)
    throw new EbayCreditError("This card has no TCGplayer product ID", 422);
  if (!card.supportedGame)
    throw new EbayCreditError(
      "TCG Explorer does not yet support this card's market",
      422,
    );
  const context = {
    ...card,
    printing: "all",
    condition,
    language: "English" as const,
  };
  const cached = getCachedTcgSnapshot(card.cached, context);
  // Configuration errors must not reserve a user's credit.
  const config = cached ? null : deps.getConfig();
  let succeeded = false;
  const base = {
    productId: card.productId,
    printing: "all",
    condition,
    language: "English" as const,
    fetchedAt: new Date().toISOString(),
  };
  function publish(side: MarketplaceSide, snapshot: TcgSnapshot) {
    signal.throwIfAborted();
    succeeded = true;
    emit?.({ type: "result", side, data: snapshot });
  }
  const result = await deps.runFeature(
    uid,
    async () => {
      if (cached) {
        publish("sold", { ...cached, offers: null, offersMatched: false });
        publish("active", { ...cached, sales: null });
        return cached;
      }
      async function fetchSide(side: MarketplaceSide): Promise<TcgSnapshot> {
        try {
          const snapshot: TcgSnapshot =
            side === "sold"
              ? {
                  ...base,
                  sales: await deps.fetchSales(context, signal, config!),
                  offers: null,
                  offersMatched: false,
                }
              : {
                  ...base,
                  sales: null,
                  ...(await deps.fetchOffers(context, signal, config!)),
                };
          if (side === "active" && !snapshot.offersMatched)
            throw new Error("TCG product was not matched");
          publish(side, snapshot);
          return snapshot;
        } catch (error) {
          if (!signal.aborted)
            emit?.({
              type: "failure",
              side,
              message: `We couldn't load TCG ${side === "sold" ? "sales" : "listings"}. Please try again.`,
            });
          throw error;
        }
      }
      const [sales, offers] = await Promise.allSettled([
        fetchSide("sold"),
        fetchSide("active"),
      ]);
      signal.throwIfAborted();
      if (sales.status === "rejected" && offers.status === "rejected")
        throw new Error("No TCG results could be retrieved");
      const snapshot: TcgSnapshot = {
        ...base,
        sales: sales.status === "fulfilled" ? sales.value.sales : null,
        offers: offers.status === "fulfilled" ? offers.value.offers : null,
        offersMatched:
          offers.status === "fulfilled" && offers.value.offersMatched,
      };
      if (snapshot.sales !== null && snapshot.offers !== null) {
        try {
          await deps.save(cardId, snapshot);
        } catch (error) {
          logError("Failed to cache TCG results", error);
        }
      }
      return snapshot;
    },
    signal,
    {
      hasSucceeded: () => succeeded,
      onReserved: (credits) => emit?.({ type: "started", credits }),
    },
  );
  return { ...result, fromDatabase: Boolean(cached) };
}

export function createTcgRouter(search = requestTcgExplorer) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-transform");
    next();
  });
  router.use(requireVerifiedUser);
  router.post(
    "/",
    rateLimit({
      windowMs: 60_000,
      max: 5,
      keyGenerator: (_req, res) => getAuthenticatedUid(res),
      standardHeaders: true,
      legacyHeaders: false,
    }),
    async (req, res) => {
      const signal = getRequestAbortSignal(res);
      const streaming = req.query.stream === "1";
      const emit = (event: MarketplaceSearchEvent<TcgSnapshot>) => {
        if (signal.aborted || res.destroyed || res.writableEnded) return;
        if (!res.headersSent) {
          res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
          res.setHeader("X-Accel-Buffering", "no");
          res.flushHeaders();
        }
        res.write(`${JSON.stringify(event)}\n`);
      };
      try {
        const result = await search(
          getAuthenticatedUid(res),
          req.body ?? {},
          signal,
          undefined,
          streaming ? emit : undefined,
        );
        if (!signal.aborted) {
          if (streaming) {
            emit({ type: "complete", credits: result.credits });
            res.end();
          } else res.json(result);
        }
      } catch (error) {
        if (isRequestAbort(error, signal)) return;
        logError("TCG Explorer request failed", error);
        if (res.headersSent) {
          emit({
            type: "error",
            message: "We couldn't complete the TCG search. Please try again.",
          });
          res.end();
          return;
        }
        res
          .status(error instanceof EbayCreditError ? error.statusCode : 502)
          .json({
            error:
              error instanceof EbayCreditError
                ? error.message
                : "We couldn't load TCGplayer results. Please try again.",
          });
      }
    },
  );
  return router;
}
export default createTcgRouter();
