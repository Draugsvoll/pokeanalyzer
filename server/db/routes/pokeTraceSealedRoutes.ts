import { Router, type RequestHandler } from "express";
import {
  POKETRACE_CARD_ID_PATTERN,
  PokeTraceHttpError,
} from "../../services/pokeTraceApi.js";
import {
  createPokeTraceSealedFilterOptions,
  getCachedPokeTraceSealedCatalog,
  refreshPokeTraceSealedCatalog,
} from "../../services/pokeTraceSealedCatalog.js";
import { loadPokeTraceSealedSearch } from "../../services/pokeTraceSealedSearch.js";
import { logError } from "../../security/logging.js";
import { loadPokeTraceSealedDetails } from "../../services/pokeTraceSealedDetails.js";
import {
  loadPokeTraceSealedMarketPriceHistory,
  PokeTraceSealedPriceHistoryUnavailableError,
} from "../../services/pokeTraceSealedMarketPriceHistory.js";
import { createCatalogRefreshHandler } from "./catalogRefreshHandler.js";

const router = Router();

type PokeTraceSealedCatalogRefreshHandlerDependencies = {
  refreshCatalog: typeof refreshPokeTraceSealedCatalog;
  refreshToken: string | undefined;
  reportError: (context: string, error: unknown) => void;
};

export function createPokeTraceSealedCatalogRefreshHandler(
  dependencies: Partial<PokeTraceSealedCatalogRefreshHandlerDependencies> = {},
): RequestHandler {
  return createCatalogRefreshHandler({
    errorContext: "Failed to force-refresh PokeTrace sealed catalog",
    failureMessage: "Failed to refresh sealed catalog",
    refreshCatalog:
      dependencies.refreshCatalog ?? refreshPokeTraceSealedCatalog,
    refreshToken: dependencies.refreshToken,
    reportError: dependencies.reportError,
  });
}

function queryText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function queryPrice(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  return Number(value);
}

router.get("/catalog", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(await getCachedPokeTraceSealedCatalog());
  } catch (error) {
    logError("Failed to load sealed catalog", error);
    res.status(500).json({ error: "Failed to load sealed catalog" });
  }
});

router.post("/catalog/refresh", createPokeTraceSealedCatalogRefreshHandler());

router.get("/filter-options", async (_req, res) => {
  try {
    const catalog = await getCachedPokeTraceSealedCatalog();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(createPokeTraceSealedFilterOptions(catalog.products));
  } catch (error) {
    logError("Failed to load sealed filter options", error);
    res.status(500).json({ error: "Failed to load sealed filter options" });
  }
});

router.get("/search", async (req, res) => {
  const name = queryText(req.query.name);
  const setName = queryText(req.query.setName);
  const productFamily = queryText(req.query.productFamily);
  const minPrice = queryPrice(req.query.minPrice);
  const maxPrice = queryPrice(req.query.maxPrice);
  if (
    [name, setName, productFamily].some((value) => value.length > 100) ||
    (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) ||
    (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
    (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)
  ) {
    res.status(400).json({ error: "Invalid sealed search filters" });
    return;
  }
  if (
    !name &&
    !setName &&
    !productFamily &&
    minPrice === undefined &&
    maxPrice === undefined
  ) {
    res.status(400).json({ error: "At least one search field is required" });
    return;
  }

  try {
    res.json(
      await loadPokeTraceSealedSearch({
        name,
        setName,
        productFamily,
        minPrice,
        maxPrice,
      }),
    );
  } catch (error) {
    logError("Failed to search sealed products", error);
    res.status(500).json({ error: "Failed to search sealed products" });
  }
});

type SealedMarketPriceHistoryHandlerDependencies = {
  loadHistory: typeof loadPokeTraceSealedMarketPriceHistory;
  reportError: (context: string, error: unknown) => void;
};

export function createSealedMarketPriceHistoryHandler(
  dependencies: Partial<SealedMarketPriceHistoryHandlerDependencies> = {},
): RequestHandler {
  const loadHistory =
    dependencies.loadHistory ?? loadPokeTraceSealedMarketPriceHistory;
  const reportError = dependencies.reportError ?? logError;
  return async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!POKETRACE_CARD_ID_PATTERN.test(id)) {
      res.status(400).json({ error: "Invalid sealed product ID" });
      return;
    }

    try {
      const history = await loadHistory(id);
      if (!history) {
        res.status(404).json({ error: "Sealed product not found" });
        return;
      }
      res.json(history);
    } catch (error) {
      reportError("Failed to load live sealed price history", error);
      const status =
        error instanceof PokeTraceSealedPriceHistoryUnavailableError
          ? 503
          : error instanceof PokeTraceHttpError && error.status === 404
            ? 404
            : 502;
      res.status(status).json({ error: "Failed to load sealed price history" });
    }
  };
}

router.get(
  "/:id/market-price-history",
  createSealedMarketPriceHistoryHandler(),
);

router.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (!POKETRACE_CARD_ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid sealed product ID" });
    return;
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    const product = await loadPokeTraceSealedDetails(id);
    if (!product) {
      res.status(404).json({ error: "Sealed product not found" });
      return;
    }
    res.json(product);
  } catch (error) {
    logError("Failed to load stored sealed product", error);
    res.status(500).json({ error: "Failed to load sealed product" });
  }
});

export default router;
