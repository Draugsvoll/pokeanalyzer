import { Router, type Request, type Response } from "express";
import { GrokApiError, testChat } from "../../services/xaiService.js";

const router = Router();

const prompt:string =
"In a highly sophisticated pokemon web-app. how would you rate individual pokemons 1-10 as a collector item"

router.get("/test", async (req: Request, res: Response) => {
  try {
    const query =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim()
        : prompt;

    const text = await testChat(query);

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

export default router;
