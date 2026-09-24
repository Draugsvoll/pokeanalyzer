import { Router, type RequestHandler } from "express";
import { ensurePokeTraceReady, pokeTraceDb } from "../pokeTraceDb.js";
import { logError } from "../../security/logging.js";
import {
  loadMarketCategories,
  type MarketCategoriesPayload,
} from "../../services/marketCategories.js";

type MarketCategoriesHandlerDependencies = {
  loadCategories: () => Promise<MarketCategoriesPayload | null>;
  reportError: (context: string, error: unknown) => void;
};

async function loadStoredMarketCategories() {
  await ensurePokeTraceReady();
  return loadMarketCategories(pokeTraceDb);
}

export function createMarketCategoriesHandler(
  dependencies: Partial<MarketCategoriesHandlerDependencies> = {},
): RequestHandler {
  const loadCategories =
    dependencies.loadCategories ?? loadStoredMarketCategories;
  const reportError = dependencies.reportError ?? logError;

  return async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const payload = await loadCategories();
      if (!payload) {
        res.status(503).json({ error: "Market categories are not available" });
        return;
      }
      res.json(payload);
    } catch (error) {
      reportError("Failed to load market categories", error);
      res.status(500).json({ error: "Failed to load market categories" });
    }
  };
}

const router = Router();
router.get("/", createMarketCategoriesHandler());

export default router;
