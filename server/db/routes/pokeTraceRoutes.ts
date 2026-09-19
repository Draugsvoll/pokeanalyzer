import { Router, type RequestHandler } from "express";
import { ensurePokeTraceReady, pokeTraceDb } from "../pokeTraceDb.js";
import { logError } from "../../security/logging.js";
import { POKETRACE_CARD_ID_PATTERN } from "../../services/pokeTraceApi.js";
import { parsePokeTraceSavedResponses } from "../../../shared/pokeTraceSavedResponses.js";
import { toPokemonCard } from "../../services/pokeTraceCardView.js";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { loadPokeTraceCatalog } from "../../services/pokeTraceCatalog.js";

const router = Router();
const gzipAsync = promisify(gzip);
const CATALOG_SERVER_CACHE_MS = 5 * 60 * 1000;
type CatalogPayload = { expiresAt: number; json: string; gzip: Buffer };
let cachedCatalogPayload: CatalogPayload | undefined;
let catalogBuildPromise: Promise<CatalogPayload> | undefined;

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
  const cached = cachedCatalogPayload;
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  if (catalogBuildPromise) return catalogBuildPromise;

  const build = (async () => {
    const catalog = await loadPokeTraceCatalog();
    const json = JSON.stringify(catalog);
    const payload = {
      expiresAt: Date.now() + CATALOG_SERVER_CACHE_MS,
      json,
      gzip: await gzipAsync(json),
    };
    cachedCatalogPayload = payload;
    return payload;
  })();
  catalogBuildPromise = build;

  try {
    return await build;
  } finally {
    catalogBuildPromise = undefined;
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

router.get("/search", async (req, res) => {
  const pokemonName =
    typeof req.query.pokemonName === "string"
      ? req.query.pokemonName.trim()
      : "";
  const setName =
    typeof req.query.setName === "string" ? req.query.setName.trim() : "";
  const cardNumber =
    typeof req.query.cardNumber === "string" ? req.query.cardNumber.trim() : "";
  const rarity =
    typeof req.query.rarity === "string" ? req.query.rarity.trim() : "";
  const cardId =
    typeof req.query.cardId === "string" ? req.query.cardId.trim() : "";
  const values = [pokemonName, setName, cardNumber, rarity, cardId];
  if (values.some((value) => value.length > 100)) {
    res.status(400).json({ error: "Search value is too long" });
    return;
  }
  if (values.every((value) => !value)) {
    res.status(400).json({ error: "At least one search field is required" });
    return;
  }
  try {
    await ensurePokeTraceReady();
    const result = await pokeTraceDb.execute({
      sql: `
        SELECT raw_json, tcg_market_comparisons
        FROM poketrace_cards
        WHERE (? = '' OR instr(lower(name), lower(?)) > 0)
          AND (? = '' OR instr(lower(set_name), lower(?)) > 0)
          AND (
            ? = ''
            OR lower(card_number) = lower(?)
            OR lower(
              ltrim(
                CASE
                  WHEN instr(card_number, '/') > 0
                    THEN substr(card_number, 1, instr(card_number, '/') - 1)
                  ELSE card_number
                END,
                '0'
              )
            ) = lower(ltrim(?, '0'))
          )
          AND (? = '' OR instr(lower(rarity), lower(?)) > 0)
          AND (? = '' OR instr(lower(id), lower(?)) > 0)
        ORDER BY name, set_name, card_number, variant
        LIMIT 50
      `,
      args: [
        pokemonName,
        pokemonName,
        setName,
        setName,
        cardNumber,
        cardNumber,
        cardNumber,
        rarity,
        rarity,
        cardId,
        cardId,
      ],
    });
    res.json(
      result.rows.map((row) =>
        toPokemonCard(row.raw_json, {}, [], row.tcg_market_comparisons),
      ),
    );
  } catch (error) {
    logError("Failed to search PokeTrace cards", error);
    res.status(500).json({ error: "Failed to search cards" });
  }
});

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
    logError("Failed to build PokeTrace browser catalog", error);
    res.status(500).json({ error: "Failed to load card catalog" });
  }
});

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
