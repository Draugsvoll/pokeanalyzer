import { Router } from "express";
import { logError } from "../../security/logging.js";
import { getMarketSummary } from "../marketSummaryStore.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const summary = await getMarketSummary();
    res.setHeader("Cache-Control", "no-store");
    res.json(summary);
  } catch (error) {
    logError("Failed to fetch market summary", error);
    res.status(500).json({ error: "Failed to fetch market summary" });
  }
});

export default router;
