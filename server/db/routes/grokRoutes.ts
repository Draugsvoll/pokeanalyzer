import { Router, type Request, type Response } from "express";
import { chat, GrokApiError, multimodalChat } from "../../services/xaiService.js";
import {
  authenticityCheckPrompt,
  identifyCardPrompt,
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

const router = Router();
const MAX_PROMPT_LENGTH = 10_000;
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
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const feature = typeof req.body?.feature === "string" ? req.body.feature.trim() : "";

    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      throw new CreditHttpError("prompt must contain 1 to 10000 characters", 400);
    }
    if (!ALLOWED_GROK_FEATURES.has(feature)) {
      throw new CreditHttpError("Invalid Grok feature", 400);
    }

    const result = await runPaidFeature(
      uid,
      feature,
      () => chat(prompt, signal),
      signal,
    );
    res.json({
      provider: "grok",
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
