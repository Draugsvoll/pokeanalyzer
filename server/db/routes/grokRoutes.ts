import { Router, type Request, type Response } from "express";
import {
  chat,
  GrokApiError,
  multimodalChat,
} from "../../services/xaiService.js";
import {
  authenticityCheckPrompt,
  identifyCardPrompt,
  priceAnalysisInput,
  priceAnalysisInstructions,
  PsaGradingPrompt,
  salesDataInput,
  salesDataInstructions,
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
import { getCardGrokContext, saveCardGrokResponse } from "../cardGrokStore.js";
import { getCardGrokFeature } from "../cardGrokConfig.js";
import {
  getCardAnalysisRequest,
  type CardAnalysisRequest,
} from "./cardAnalysisRequests.js";

const router = Router();
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
  "sell_price",
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

  const prefix = ALLOWED_IMAGE_PREFIXES.find((candidate) =>
    value.startsWith(candidate),
  );
  if (!prefix) {
    throw new CreditHttpError(
      "Only JPEG, PNG, and WebP images are supported",
      400,
    );
  }

  const encoded = value.slice(prefix.length);
  const decodedSize = Buffer.byteLength(encoded, "base64");
  if (!encoded || decodedSize < 1 || decodedSize > MAX_IMAGE_SIZE_BYTES) {
    throw new CreditHttpError("Each image must be 10 MB or smaller", 400);
  }

  return value;
}

type IndependentAnalysisResult =
  { fromDatabase: boolean; ok: true; text: string } | { ok: false };
type CardAnalysisGrokOptions = NonNullable<CardAnalysisRequest["grokOptions"]>;

function logRawGrokResponseBeforeParsing(
  feature: string,
  storageKey: string,
  response: unknown,
) {
  if (process.env.DEBUG_LOCALLY !== "true") return;

  const responseText =
    typeof response === "string" ? response : JSON.stringify(response);
  console.log(
    `Raw Grok response before JSON parsing (${feature}/${storageKey}):`,
    responseText?.slice(0, 2_000),
  );
}

async function resolveStoredCardAnalysis(
  cardId: string,
  storageKey: string,
  storedResponse: Record<string, unknown> | null,
  userInput: string,
  instructions: string,
  signal: AbortSignal,
): Promise<IndependentAnalysisResult> {
  if (storedResponse) {
    return {
      fromDatabase: true,
      ok: true,
      text: JSON.stringify(storedResponse),
    };
  }

  const response = await chat(userInput, {
    instructions,
    signal,
  });
  logRawGrokResponseBeforeParsing(storageKey, storageKey, response);
  const savedResponse = await saveCardGrokResponse(
    cardId,
    storageKey,
    response,
  );
  if (!savedResponse) {
    throw new GrokApiError("AI returned invalid analysis JSON", 502);
  }

  return {
    fromDatabase: false,
    ok: true,
    text: JSON.stringify(savedResponse),
  };
}

router.post("/market-prices", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const cardId =
      typeof req.body?.cardId === "string" ? req.body.cardId.trim() : "";
    if (!cardId || cardId.length > MAX_CARD_ID_LENGTH) {
      throw new CreditHttpError(
        "A valid cardId is required for card analysis",
        400,
      );
    }

    const priceFeature = getCardGrokFeature("price_analysis")!;
    const salesFeature = getCardGrokFeature("sales_data")!;
    const [priceContext, salesContext] = await Promise.all([
      getCardGrokContext(
        cardId,
        priceFeature.storageKey,
        priceFeature.reuseDays,
      ),
      getCardGrokContext(
        cardId,
        salesFeature.storageKey,
        salesFeature.reuseDays,
      ),
    ]);

    if (!priceContext?.cardName || !salesContext?.cardName) {
      throw new CreditHttpError("Card not found", 404);
    }
    if (
      !priceContext.setName ||
      !priceContext.cardNumber ||
      !salesContext.setName ||
      !salesContext.cardNumber
    ) {
      throw new CreditHttpError("Card is missing set or number data", 422);
    }

    const result = await runPaidFeature(
      uid,
      "price_analysis",
      async () => {
        const [priceResult, salesResult] = await Promise.allSettled([
          resolveStoredCardAnalysis(
            cardId,
            priceFeature.storageKey,
            priceContext.storedResponse,
            priceAnalysisInput(
              priceContext.cardName,
              priceContext.setName,
              priceContext.cardNumber,
            ),
            priceAnalysisInstructions,
            signal,
          ),
          resolveStoredCardAnalysis(
            cardId,
            salesFeature.storageKey,
            salesContext.storedResponse,
            salesDataInput(
              salesContext.cardName,
              salesContext.setName,
              salesContext.cardNumber,
            ),
            salesDataInstructions,
            signal,
          ),
        ]);

        if (
          priceResult.status === "rejected" &&
          !isRequestAbort(priceResult.reason, signal)
        ) {
          logError("AI market price analysis failed", priceResult.reason);
        }
        if (
          salesResult.status === "rejected" &&
          !isRequestAbort(salesResult.reason, signal)
        ) {
          logError("AI sales data analysis failed", salesResult.reason);
        }

        const priceAnalysis: IndependentAnalysisResult =
          priceResult.status === "fulfilled"
            ? priceResult.value
            : { ok: false };
        const salesData: IndependentAnalysisResult =
          salesResult.status === "fulfilled"
            ? salesResult.value
            : { ok: false };

        if (!priceAnalysis.ok && !salesData.ok) {
          throw new GrokApiError("Both AI market requests failed", 502);
        }

        return { priceAnalysis, salesData };
      },
      signal,
    );

    res.json({
      ...result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("AI market prices route failed", error);
    sendRouteError(res, error, "Request failed");
  }
});

router.post("/", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const clientUserInput =
      typeof req.body?.userInput === "string" ? req.body.userInput.trim() : "";
    const requestedInstructions =
      typeof req.body?.instructions === "string"
        ? req.body.instructions.trim()
        : undefined;
    const feature =
      typeof req.body?.feature === "string" ? req.body.feature.trim() : "";

    if (!ALLOWED_GROK_FEATURES.has(feature)) {
      throw new CreditHttpError("Invalid AI feature", 400);
    }

    const adminUid = process.env.ADMIN_UID?.trim();
    if (feature === "market_news" && (!adminUid || uid !== adminUid)) {
      throw new CreditHttpError("Admin access required", 403);
    }

    let resolvedUserInput = clientUserInput;
    let instructions =
      feature === "market_news" ? requestedInstructions : undefined;
    let grokOptions: CardAnalysisGrokOptions = {};
    let cardGrokTarget: { cardId: string; storageKey: string } | null = null;
    const cardGrokFeature = getCardGrokFeature(feature);

    if (cardGrokFeature) {
      const cardId =
        typeof req.body?.cardId === "string" ? req.body.cardId.trim() : "";
      if (!cardId || cardId.length > MAX_CARD_ID_LENGTH) {
        throw new CreditHttpError(
          "A valid cardId is required for card analysis",
          400,
        );
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
      const cardAnalysisRequest = getCardAnalysisRequest(feature);
      if (!cardAnalysisRequest) {
        throw new CreditHttpError("Unsupported stored card feature", 400);
      }
      resolvedUserInput = cardAnalysisRequest.buildUserInput(context);
      instructions = cardAnalysisRequest.instructions;
      grokOptions = cardAnalysisRequest.grokOptions ?? {};
    }

    if (!resolvedUserInput) {
      throw new CreditHttpError("userInput is required", 400);
    }
    if (feature === "market_news" && !instructions) {
      throw new CreditHttpError(
        "instructions are required for market news",
        400,
      );
    }

    const result = await runPaidFeature(
      uid,
      feature,
      async () => {
        const response = await chat(resolvedUserInput, {
          instructions,
          signal,
          ...grokOptions,
        });
        if (!cardGrokTarget) return response;

        logRawGrokResponseBeforeParsing(
          feature,
          cardGrokTarget.storageKey,
          response,
        );
        const storedResponse = await saveCardGrokResponse(
          cardGrokTarget.cardId,
          cardGrokTarget.storageKey,
          response,
        );
        if (!storedResponse) {
          throw new CreditHttpError("AI returned invalid analysis JSON", 502);
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
    logError("AI query route failed", error);
    sendRouteError(res, error, "Request failed");
  }
});

router.post("/psa-grade", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const frontImageBase64 = getImageDataUrl(req.body?.frontImageBase64, true)!;
    const backImageBase64 = getImageDataUrl(req.body?.backImageBase64, false);
    const message = PsaGradingPrompt(frontImageBase64, backImageBase64);
    const result = await runPaidFeature(
      uid,
      "worth_grading",
      () => multimodalChat([message], signal),
      signal,
    );

    res.json({
      provider: "grok",
      text: result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("AI PSA grading route failed", error);
    sendRouteError(res, error, "AI PSA grading request failed");
  }
});

router.post("/identify-card", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const frontImageBase64 = getImageDataUrl(req.body?.frontImageBase64, true)!;
    const message = identifyCardPrompt(frontImageBase64);
    const result = await runPaidFeature(
      uid,
      "card_identification",
      () => multimodalChat([message], signal),
      signal,
    );

    res.json({
      provider: "grok",
      text: result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("AI card identification route failed", error);
    sendRouteError(res, error, "AI card identification request failed");
  }
});

router.post("/authenticity-check", async (req: Request, res: Response) => {
  const signal = getRequestAbortSignal(res);
  try {
    const uid = getAuthenticatedUid(res);
    const frontImageBase64 = getImageDataUrl(req.body?.frontImageBase64, true)!;
    const backImageBase64 = getImageDataUrl(req.body?.backImageBase64, false);
    const message = authenticityCheckPrompt(frontImageBase64, backImageBase64);
    const result = await runPaidFeature(
      uid,
      "authenticity_check",
      () => multimodalChat([message], signal),
      signal,
    );

    res.json({
      provider: "grok",
      text: result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    if (isRequestAbort(error, signal)) return;
    logError("AI authenticity check route failed", error);
    sendRouteError(res, error, "AI authenticity check request failed");
  }
});

export default router;
