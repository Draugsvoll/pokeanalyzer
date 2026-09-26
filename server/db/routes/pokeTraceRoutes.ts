import { Router, type RequestHandler } from "express";
import { ensurePokeTraceReady, pokeTraceDb } from "../pokeTraceDb.js";
import { logError } from "../../security/logging.js";
import { POKETRACE_CARD_ID_PATTERN } from "../../services/pokeTraceApi.js";
import { parsePokeTraceSavedResponses } from "../../../shared/pokeTraceSavedResponses.js";
import { toPokemonCard } from "../../services/pokeTraceCardView.js";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { getCachedPokeTraceCatalog } from "../../services/pokeTraceCatalog.js";
import {
  loadMarketPriceHistory,
  PokeTracePriceHistoryUnavailableError,
  type MarketPriceHistory,
} from "../../services/pokeTraceMarketPriceHistory.js";
import {
  MARKET_MOVER_DIRECTIONS,
  POKETRACE_GAMES,
  POKETRACE_MARKETS,
  type MarketMoversQuery,
  type MarketMoversResponse,
} from "../../../shared/marketMovers.js";
import {
  loadPokeTraceMarketMovers,
  PokeTraceMoversUnavailableError,
} from "../../services/pokeTraceMarketMovers.js";
import { loadPokeTraceSearch } from "../../services/pokeTraceSearch.js";
import {
  isPokeTraceSearchSort,
  POKETRACE_DEFAULT_SEARCH_SORT,
} from "../../../shared/pokeTraceSearch.js";
import { isPokeTraceRawCondition } from "../../../shared/pokeTraceMarketConditions.js";

const router = Router();
const gzipAsync = promisify(gzip);
type CatalogPayload = { generatedAt: string; json: string; gzip: Buffer };
let cachedCatalogPayload: CatalogPayload | undefined;
let catalogBuild:
  { generatedAt: string; promise: Promise<CatalogPayload> } | undefined;

export function acceptsGzip(header: string | undefined) {
  return (header ?? "").split(",").some((encoding) => {
    const [name, ...parameters] = encoding.trim().toLowerCase().split(";");
    if (name !== "gzip") return false;
    const quality = parameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter.startsWith("q="));
    return quality ? Number(quality.slice(2)) > 0 : true;
  });
}

async function getCatalogPayload() {
  const catalog = await getCachedPokeTraceCatalog();
  const cached = cachedCatalogPayload;
  if (cached?.generatedAt === catalog.generatedAt) {
    return cached;
  }
  if (catalogBuild?.generatedAt === catalog.generatedAt) {
    return catalogBuild.promise;
  }

  const build = (async () => {
    const json = JSON.stringify(catalog);
    const payload = {
      generatedAt: catalog.generatedAt,
      json,
      gzip: await gzipAsync(json),
    };
    cachedCatalogPayload = payload;
    return payload;
  })();
  catalogBuild = { generatedAt: catalog.generatedAt, promise: build };

  try {
    return await build;
  } finally {
    if (catalogBuild?.promise === build) catalogBuild = undefined;
  }
}

type PokeTracePriceHistory = {
  cardId: string;
  days: number;
  snapshots: Array<{
    recordedAt: string;
    currency: string | null;
    prices: Record<string, unknown>;
    sourceUpdatedAt: string | null;
  }>;
};

type MarketMoversHandlerDependencies = {
  loadMovers: (query: MarketMoversQuery) => Promise<MarketMoversResponse>;
  reportError: (context: string, error: unknown) => void;
};

type PokeTraceSearchHandlerDependencies = {
  loadSearch: typeof loadPokeTraceSearch;
  reportError: (context: string, error: unknown) => void;
};

function singleQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function optionalNumber(value: unknown) {
  const raw = singleQueryValue(value);
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !raw.trim()) return Number.NaN;
  return Number(raw);
}

function optionalBoolean(value: unknown) {
  const raw = singleQueryValue(value);
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function optionalMoverFilter(value: unknown) {
  const raw = singleQueryValue(value);
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  return /^[a-z0-9_-]{1,40}$/i.test(normalized) ? normalized : null;
}

export function createMarketMoversHandler(
  dependencies: Partial<MarketMoversHandlerDependencies> = {},
): RequestHandler {
  const loadMovers = dependencies.loadMovers ?? loadPokeTraceMarketMovers;
  const reportError = dependencies.reportError ?? logError;

  return async (req, res) => {
    const direction = singleQueryValue(req.query.direction) ?? "gainers";
    const market = singleQueryValue(req.query.market) ?? "US";
    const game = singleQueryValue(req.query.game) ?? "pokemon";
    const rawLimit = singleQueryValue(req.query.limit) ?? "6";
    const limit =
      typeof rawLimit === "string" && /^\d+$/.test(rawLimit)
        ? Number(rawLimit)
        : Number.NaN;
    const minPrice = optionalNumber(req.query.minPrice);
    const maxDiff = optionalNumber(req.query.maxDiff);
    const hasGraded = optionalBoolean(req.query.hasGraded);
    const source = optionalMoverFilter(req.query.source);
    const tier = optionalMoverFilter(req.query.tier);

    if (
      typeof direction !== "string" ||
      !MARKET_MOVER_DIRECTIONS.includes(
        direction as (typeof MARKET_MOVER_DIRECTIONS)[number],
      ) ||
      typeof market !== "string" ||
      !POKETRACE_MARKETS.includes(
        market as (typeof POKETRACE_MARKETS)[number],
      ) ||
      typeof game !== "string" ||
      !POKETRACE_GAMES.includes(game as (typeof POKETRACE_GAMES)[number]) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 20 ||
      (minPrice !== undefined &&
        (!Number.isFinite(minPrice) || minPrice < 0)) ||
      (maxDiff !== undefined && (!Number.isFinite(maxDiff) || maxDiff < 0)) ||
      hasGraded === null ||
      source === null ||
      tier === null
    ) {
      res.status(400).json({ error: "Invalid market movers query" });
      return;
    }

    const query: MarketMoversQuery = {
      direction: direction as MarketMoversQuery["direction"],
      game: game as MarketMoversQuery["game"],
      limit,
      market: market as MarketMoversQuery["market"],
      ...(hasGraded !== undefined && { hasGraded }),
      ...(maxDiff !== undefined && { maxDiff }),
      ...(minPrice !== undefined && { minPrice }),
      ...(source !== undefined && { source }),
      ...(tier !== undefined && { tier }),
    };

    try {
      res.json(await loadMovers(query));
    } catch (error) {
      reportError("Failed to fetch PokeTrace market movers", error);
      res
        .status(error instanceof PokeTraceMoversUnavailableError ? 503 : 502)
        .json({ error: "Failed to fetch market movers" });
    }
  };
}

function isValidCardId(id: unknown): id is string {
  return typeof id === "string" && POKETRACE_CARD_ID_PATTERN.test(id);
}

type VariantIdentityRow = {
  id: unknown;
  variant: unknown;
  tcgplayer_id: unknown;
};

function variantLabel(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Normal";
}

export function selectUnambiguousVariants(
  rows: VariantIdentityRow[],
  currentCardId: string,
  currentTcgplayerId: unknown,
): Array<{ id: string; name: string }> {
  const groups = new Map<string, VariantIdentityRow[]>();
  for (const row of rows) {
    if (typeof row.id !== "string") continue;
    const name = variantLabel(row.variant);
    const key = name.toLocaleLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()].flatMap((candidates) => {
    const current = candidates.find(
      (candidate) => candidate.id === currentCardId,
    );
    if (current && typeof current.id === "string") {
      return [{ id: current.id, name: variantLabel(current.variant) }];
    }
    if (candidates.length === 1 && typeof candidates[0].id === "string") {
      return [
        { id: candidates[0].id, name: variantLabel(candidates[0].variant) },
      ];
    }
    if (currentTcgplayerId == null) return [];

    const matchingProduct = candidates.filter(
      (candidate) => candidate.tcgplayer_id === currentTcgplayerId,
    );
    if (
      matchingProduct.length !== 1 ||
      typeof matchingProduct[0].id !== "string"
    ) {
      return [];
    }
    return [
      {
        id: matchingProduct[0].id,
        name: variantLabel(matchingProduct[0].variant),
      },
    ];
  });
}

export async function loadPokeTracePriceHistory(
  cardId: string,
  days: number,
  database: Pick<typeof pokeTraceDb, "execute"> = pokeTraceDb,
  ready: Promise<unknown> = ensurePokeTraceReady(),
): Promise<PokeTracePriceHistory | null> {
  await ready;
  const card = await database.execute({
    sql: "SELECT id FROM poketrace_cards WHERE id = ?",
    args: [cardId],
  });
  if (!card.rows[0]) return null;

  const result = await database.execute({
    sql: `
      SELECT recorded_at, currency, market_price, source_updated_at
      FROM (
        SELECT recorded_at, currency, market_price, source_updated_at
        FROM poketrace_tcg_market_prices
        WHERE card_id = ?
        ORDER BY recorded_at DESC
        LIMIT ?
      )
      ORDER BY recorded_at ASC
    `,
    args: [cardId, days],
  });

  const snapshots = result.rows.map((row) => ({
    recordedAt: String(row.recorded_at),
    currency: row.currency == null ? null : String(row.currency),
    prices: {
      tcgplayer: {
        NEAR_MINT: { avg: Number(row.market_price) },
      },
    },
    sourceUpdatedAt:
      row.source_updated_at == null ? null : String(row.source_updated_at),
  }));

  return {
    cardId,
    days,
    snapshots,
  };
}

type PriceHistoryHandlerDependencies = {
  loadHistory: (
    cardId: string,
    days: number,
  ) => Promise<PokeTracePriceHistory | null>;
  reportError: (context: string, error: unknown) => void;
};

export function createPokeTracePriceHistoryHandler(
  dependencies: Partial<PriceHistoryHandlerDependencies> = {},
): RequestHandler {
  const loadHistory = dependencies.loadHistory ?? loadPokeTracePriceHistory;
  const reportError = dependencies.reportError ?? logError;

  return async (req, res) => {
    const cardId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!isValidCardId(cardId)) {
      res.status(400).json({ error: "Invalid card ID" });
      return;
    }

    const rawDays = Array.isArray(req.query.days)
      ? req.query.days[0]
      : (req.query.days ?? "7");
    const days =
      typeof rawDays === "string" && /^\d+$/.test(rawDays)
        ? Number(rawDays)
        : Number.NaN;
    if (!Number.isSafeInteger(days) || days < 1 || days > 30) {
      res.status(400).json({
        error: "days must be an integer between 1 and 30",
      });
      return;
    }

    try {
      const history = await loadHistory(cardId, days);
      if (!history) {
        res.status(404).json({ error: "Card not found" });
        return;
      }
      res.json(history);
    } catch (error) {
      reportError("Failed to fetch PokeTrace price history", error);
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  };
}

type MarketPriceHistoryHandlerDependencies = {
  loadHistory: (cardId: string) => Promise<MarketPriceHistory | null>;
  reportError: (context: string, error: unknown) => void;
};

export function createMarketPriceHistoryHandler(
  dependencies: Partial<MarketPriceHistoryHandlerDependencies> = {},
): RequestHandler {
  const loadHistory = dependencies.loadHistory ?? loadMarketPriceHistory;
  const reportError = dependencies.reportError ?? logError;

  return async (req, res) => {
    const cardId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!isValidCardId(cardId)) {
      res.status(400).json({ error: "Invalid card ID" });
      return;
    }

    try {
      const history = await loadHistory(cardId);
      if (!history) {
        res.status(404).json({ error: "Card not found" });
        return;
      }
      res.json(history);
    } catch (error) {
      reportError("Failed to fetch marketplace price history", error);
      const unavailable =
        error instanceof PokeTracePriceHistoryUnavailableError;
      res.status(unavailable ? 503 : 502).json({
        error: unavailable
          ? "Price history is unavailable"
          : "Failed to fetch price history",
      });
    }
  };
}

export function createPokeTraceSearchHandler(
  dependencies: Partial<PokeTraceSearchHandlerDependencies> = {},
): RequestHandler {
  const loadSearch = dependencies.loadSearch ?? loadPokeTraceSearch;
  const reportError = dependencies.reportError ?? logError;

  return async (req, res) => {
    const pokemonName =
      typeof req.query.pokemonName === "string"
        ? req.query.pokemonName.trim()
        : "";
    const setName =
      typeof req.query.setName === "string" ? req.query.setName.trim() : "";
    const cardNumber =
      typeof req.query.cardNumber === "string"
        ? req.query.cardNumber.trim()
        : "";
    const rarity =
      typeof req.query.rarity === "string" ? req.query.rarity.trim() : "";
    const cardId =
      typeof req.query.cardId === "string" ? req.query.cardId.trim() : "";
    const minPrice = optionalNumber(req.query.minPrice);
    const maxPrice = optionalNumber(req.query.maxPrice);
    const requestedSort =
      typeof req.query.sort === "string" ? req.query.sort.trim() : "";
    const sort = requestedSort || POKETRACE_DEFAULT_SEARCH_SORT;
    const requestedCondition =
      typeof req.query.condition === "string" ? req.query.condition.trim() : "";
    const condition = isPokeTraceRawCondition(requestedCondition)
      ? requestedCondition
      : undefined;
    if (req.query.condition !== undefined && condition === undefined) {
      res.status(400).json({ error: "Invalid search condition" });
      return;
    }
    const values = [pokemonName, setName, cardNumber, rarity, cardId];
    if (values.some((value) => value.length > 100)) {
      res.status(400).json({ error: "Search value is too long" });
      return;
    }
    if (!isPokeTraceSearchSort(sort)) {
      res.status(400).json({ error: "Invalid search sort" });
      return;
    }
    if (
      (minPrice !== undefined &&
        (!Number.isFinite(minPrice) || minPrice < 0)) ||
      (maxPrice !== undefined &&
        (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
      (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)
    ) {
      res.status(400).json({ error: "Invalid search filters" });
      return;
    }
    if (
      values.every((value) => !value) &&
      minPrice === undefined &&
      maxPrice === undefined &&
      condition === undefined
    ) {
      res.status(400).json({ error: "At least one search field is required" });
      return;
    }
    try {
      res.json(
        await loadSearch({
          cardId,
          cardNumber,
          condition,
          maxPrice,
          minPrice,
          pokemonName,
          rarity,
          setName,
          sort,
        }),
      );
    } catch (error) {
      reportError("Failed to search PokeTrace cards", error);
      res.status(500).json({ error: "Failed to search cards" });
    }
  };
}

router.get("/search", createPokeTraceSearchHandler());

router.get("/catalog", async (req, res) => {
  try {
    const payload = await getCatalogPayload();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Vary", "Accept-Encoding");
    if (acceptsGzip(req.headers["accept-encoding"])) {
      res.setHeader("Content-Encoding", "gzip");
      res.send(payload.gzip);
      return;
    }
    res.send(payload.json);
  } catch (error) {
    logError("Failed to load PokeTrace browser catalog", error);
    res.status(500).json({ error: "Failed to load card catalog" });
  }
});

router.get("/movers", createMarketMoversHandler());

router.get("/", async (_req, res) => {
  try {
    await ensurePokeTraceReady();
    const result = await pokeTraceDb.execute(`
      SELECT raw_json, tcg_market_comparisons
      FROM poketrace_cards
      ORDER BY name, set_name, card_number, variant
      LIMIT 10
    `);
    res.json(
      result.rows.map((row) =>
        toPokemonCard(row.raw_json, {}, [], row.tcg_market_comparisons),
      ),
    );
  } catch (error) {
    logError("Failed to load PokeTrace cards", error);
    res.status(500).json({ error: "Failed to load cards" });
  }
});

router.get("/:id/price-history", createPokeTracePriceHistoryHandler());
router.get("/:id/market-price-history", createMarketPriceHistoryHandler());

router.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (!isValidCardId(id)) {
    res.status(400).json({ error: "Invalid card ID" });
    return;
  }
  try {
    await ensurePokeTraceReady();
    const result = await pokeTraceDb.execute({
      sql: `
        SELECT raw_json, saved_responses, fetched_at, name, set_name, card_number,
          tcgplayer_id, tcg_market_comparisons
        FROM poketrace_cards
        WHERE id = ?
      `,
      args: [id],
    });
    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    const variantResult = await pokeTraceDb.execute({
      sql: `
        SELECT id, variant, tcgplayer_id
        FROM poketrace_cards
        WHERE name = ?
          AND set_name IS ?
          AND card_number IS ?
        ORDER BY lower(coalesce(variant, '')), id
      `,
      args: [row.name, row.set_name, row.card_number],
    });
    const variants = selectUnambiguousVariants(
      variantResult.rows as unknown as VariantIdentityRow[],
      id,
      row.tcgplayer_id,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(
      toPokemonCard(
        row.raw_json,
        parsePokeTraceSavedResponses(row.saved_responses),
        variants,
        row.tcg_market_comparisons,
      ),
    );
  } catch (error) {
    logError("Failed to fetch PokeTrace card", error);
    res.status(500).json({ error: "Failed to fetch card" });
  }
});

export default router;
