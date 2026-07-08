import { Router, type Request, type Response } from "express";
import { OpenAiApiError, testOpenAiChat } from "../../services/openaiApi.js";

const router = Router();

const prompt: string =
  "In a highly sophisticated pokemon web-app, how would you rate individual pokemon 1-10 as collector items?";

router.get("/test", async (req: Request, res: Response) => {
  try {
    const query =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim()
        : prompt;

    const text = await testOpenAiChat(query);

    res.json({
      provider: "openai",
      query,
      text,
    });
  } catch (err) {
    console.error("OpenAI query route failed");

    const statusCode = err instanceof OpenAiApiError ? err.statusCode : 500;

    res.status(statusCode).json({
      error:
        err instanceof OpenAiApiError
          ? err.message
          : "OpenAI query request failed",
    });
  }
});

export default router;
