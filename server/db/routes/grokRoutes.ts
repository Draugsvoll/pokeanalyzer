import { Router, type Request, type Response } from "express";
import { chat, GrokApiError, multimodalChat } from "../../services/xaiService.js";
import {
  authenticityCheckPrompt,
  collectorsAnalysisPrompt,
  identifyCardPrompt,
  isWorthGradingPrompt,
  priceAnalysisPrompt,
  PsaGradingPrompt,
} from "../../../src/utils/grok/grokPrompts.js";
import { getAuthenticatedUid } from "../../security/auth.js";
import { logError } from "../../security/logging.js";
import {
  CreditHttpError,
  runPaidFeature,
} from "../../subscriptions/creditService.js";
import {
  getRequestAbortSignal,
  isRequestAbort,
} from "../../security/requestAbort.js";
import {
  getCardGrokContext,
  saveCardGrokResponse,
} from "../cardGrokStore.js";
import { getCardGrokFeature } from "../cardGrokConfig.js";

const router = Router();
const MAX_PROMPT_LENGTH = 10_000;
const MAX_CARD_ID_LENGTH = 100;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];
const ALLOWED_GROK_FEATURES = new Set([
  "collector_analysis",
  "market_news",
  "manual_test",
  "price_analysis",
  "worth_grading",
]);

function sendRouteError(res: Response, error: unknown, fallback: string) {
  if (error instanceof CreditHttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  if (error instanceof GrokApiError) {
    res.status(error.statusCode === 429 ? 429 : 502).json({ error: fallback });
    return;
  }
  res.status(500).json({ error: fallback });
}

function getImageDataUrl(value: unknown, required: boolean) {
  if (value == null || value === "") {
    if (required) throw new CreditHttpError("A front image is required", 400);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new CreditHttpError("Invalid image data", 400);
  }

  const prefix = ALLOWED_IMAGE_PREFIXES.find((candidate) => value.startsWith(candidate));
  if (!prefix) {
    throw new CreditHttpError("Only JPEG, PNG, and WebP images are supported", 400);
  }

  const encoded = value.slice(prefix.length);
  const decodedSize = Buffer.byteLength(encoded, "base64");
  if (!encoded || decodedSize < 1 || decodedSize > MAX_IMAGE_SIZE_BYTES) {
    throw new CreditHttpError("Each image must be 10 MB or smaller", 400);
  }

  return value;
}

router.post("/", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const requestedPrompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const feature = typeof req.body?.feature === "string" ? req.body.feature.trim() : "";

    if (!ALLOWED_GROK_FEATURES.has(feature)) {
      throw new CreditHttpError("Invalid Grok feature", 400);
    }

    let prompt = requestedPrompt;
    let cardGrokTarget: { cardId: string; storageKey: string } | null = null;
    const cardGrokFeature = getCardGrokFeature(feature);

    if (cardGrokFeature) {
      const cardId = typeof req.body?.cardId === "string" ? req.body.cardId.trim() : "";
      if (!cardId || cardId.length > MAX_CARD_ID_LENGTH) {
        throw new CreditHttpError("A valid cardId is required for card analysis", 400);
      }

      const context = await getCardGrokContext(
        cardId,
        cardGrokFeature.storageKey,
        cardGrokFeature.reuseDays,
      );
      if (!context || !context.cardName) {
        throw new CreditHttpError("Card not found", 404);
      }
      if (context.storedResponse) {
        const storedResult = await runPaidFeature(
          uid,
          feature,
          async () => JSON.stringify(context.storedResponse),
          signal,
        );
        res.json({
          provider: "database",
          fromDatabase: true,
          text: storedResult.data,
          subscription: storedResult.subscription,
        });
        return;
      }

      cardGrokTarget = { cardId, storageKey: cardGrokFeature.storageKey };
      if (feature === "collector_analysis") {
        prompt = collectorsAnalysisPrompt(context.cardNameAndSet);
      } else if (feature === "price_analysis") {
        if (!context.setName || !context.cardNumber) {
          throw new CreditHttpError("Card is missing set or number data", 422);
        }
        prompt = priceAnalysisPrompt(
          context.cardName,
          context.setName,
          context.cardNumber,
        );
      } else if (feature === "worth_grading") {
        prompt = isWorthGradingPrompt(context.cardNameAndSet);
      } else {
        throw new CreditHttpError("Unsupported stored card feature", 400);
      }
    }

    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      throw new CreditHttpError("prompt must contain 1 to 10000 characters", 400);
    }

    const result = await runPaidFeature(
      uid,
      feature,
      async () => {
        const response = await chat(prompt, signal);
        if (!cardGrokTarget) return response;

        const storedResponse = await saveCardGrokResponse(
          cardGrokTarget.cardId,
          cardGrokTarget.storageKey,
          response,
        );
        if (!storedResponse) {
          throw new CreditHttpError("Grok returned invalid analysis JSON", 502);
        }
        return JSON.stringify(storedResponse);
      },
      signal,
    );
    res.json({
      provider: "grok",
      fromDatabase: false,
      text: result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("Grok query route failed", error);
    sendRouteError(res, error, "Grok query request failed");
  }
});

router.post("/psa-grade", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const frontImageBase64 = getImageDataUrl(req.body?.frontImageBase64, true)!;
    const backImageBase64 = getImageDataUrl(req.body?.backImageBase64, false);
    const message = PsaGradingPrompt(frontImageBase64, backImageBase64);
    const result = await runPaidFeature(uid, "worth_grading", () =>
      multimodalChat([message], signal),
      signal,
    );

    res.json({
      provider: "grok",
      text: result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("Grok PSA grading route failed", error);
    sendRouteError(res, error, "Grok PSA grading request failed");
  }
});

router.post("/identify-card", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const frontImageBase64 = getImageDataUrl(req.body?.frontImageBase64, true)!;
    const message = identifyCardPrompt(frontImageBase64);
    const result = await runPaidFeature(uid, "card_identification", () =>
      multimodalChat([message], signal),
      signal,
    );

    res.json({
      provider: "grok",
      text: result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("Grok card identification route failed", error);
    sendRouteError(res, error, "Grok card identification request failed");
  }
});

router.post("/authenticity-check", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const frontImageBase64 = getImageDataUrl(req.body?.frontImageBase64, true)!;
    const backImageBase64 = getImageDataUrl(req.body?.backImageBase64, false);
    const message = authenticityCheckPrompt(frontImageBase64, backImageBase64);
    const result = await runPaidFeature(uid, "authenticity_check", () =>
      multimodalChat([message], signal),
      signal,
    );

    res.json({
      provider: "grok",
      text: result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("Grok authenticity check route failed", error);
    sendRouteError(res, error, "Grok authenticity check request failed");
  }
});

export default router;
