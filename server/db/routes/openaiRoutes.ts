import { Router, type Request, type Response } from "express";
import { OpenAiApiError, testOpenAiChat } from "../../services/openaiApi.js";
import { getAuthenticatedUid } from "../../security/auth.js";
import { logError } from "../../security/logging.js";
import { CreditHttpError, runPaidFeature } from "../../subscriptions/creditService.js";

const router = Router();
const MAX_PROMPT_LENGTH = 10_000;

router.post("/test", async (req: Request, res: Response) => {
  try {
    const uid = getAuthenticatedUid(res);
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      throw new CreditHttpError("prompt must contain 1 to 10000 characters", 400);
    }

    const result = await runPaidFeature(uid, "manual_test", () => testOpenAiChat(prompt));
    res.json({
      provider: "openai",
      text: result.data,
      subscription: result.subscription,
    });
  } catch (error) {
    logError("OpenAI query route failed", error);
    if (error instanceof CreditHttpError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(error instanceof OpenAiApiError && error.statusCode === 429 ? 429 : 502).json({
      error: "OpenAI query request failed",
    });
  }
});

export default router;
