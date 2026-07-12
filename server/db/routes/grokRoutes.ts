import { Router, type Request, type Response } from "express";
import { chat, GrokApiError, multimodalChat } from "../../services/xaiService.js";
import {
  authenticityCheckPrompt,
  PsaGradingPrompt,
} from "../../../src/utils/grok/grokPrompts.js";

const router = Router();

const prompt:string =
""

router.get("/", async (req: Request, res: Response) => {
  try {
    const query =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim()
        : prompt;

    const text = await chat(query);

    res.json({
      provider: "grok",
      query,
      text,
    });
  } catch (err) {
    console.error("Grok query route failed");

    const statusCode = err instanceof GrokApiError ? err.statusCode : 500;

    res.status(statusCode).json({
      error:
        err instanceof GrokApiError
          ? err.message
          : "Grok query request failed",
    });
  }
});

router.post("/psa-grade", async (req: Request, res: Response) => {
  try {
    const frontImageBase64 =
      typeof req.body?.frontImageBase64 === "string"
        ? req.body.frontImageBase64
        : "";
    const backImageBase64 =
      typeof req.body?.backImageBase64 === "string"
        ? req.body.backImageBase64
        : undefined;

    if (!frontImageBase64) {
      res.status(400).json({ error: "frontImageBase64 is required" });
      return;
    }

    const message = PsaGradingPrompt(frontImageBase64, backImageBase64);
    const text = await multimodalChat([message]);

    res.json({
      provider: "grok",
      text,
    });
  } catch (err) {
    console.error("Grok PSA grading route failed");

    const statusCode = err instanceof GrokApiError ? err.statusCode : 500;
    res.status(statusCode).json({
      error:
        err instanceof GrokApiError
          ? err.message
          : "Grok PSA grading request failed",
    });
  }
});

router.post("/authenticity-check", async (req: Request, res: Response) => {
  try {
    const frontImageBase64 =
      typeof req.body?.frontImageBase64 === "string"
        ? req.body.frontImageBase64
        : "";
    const backImageBase64 =
      typeof req.body?.backImageBase64 === "string"
        ? req.body.backImageBase64
        : undefined;

    if (!frontImageBase64) {
      res.status(400).json({ error: "frontImageBase64 is required" });
      return;
    }

    const message = authenticityCheckPrompt(frontImageBase64, backImageBase64);
    const text = await multimodalChat([message]);

    res.json({ provider: "grok", text });
  } catch (err) {
    console.error("Grok authenticity check route failed");
    const statusCode = err instanceof GrokApiError ? err.statusCode : 500;

    res.status(statusCode).json({
      error:
        err instanceof GrokApiError
          ? err.message
          : "Grok authenticity check request failed",
    });
  }
});

export default router;
