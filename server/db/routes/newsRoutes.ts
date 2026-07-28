import { Router } from "express";
import { getNewsFeeds } from "../newsStore.js";
import { logError } from "../../security/logging.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const feeds = await getNewsFeeds();
    res.setHeader("Cache-Control", "no-store");
    res.json(feeds);
  } catch (error) {
    logError("Failed to fetch news", error);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

export default router;
