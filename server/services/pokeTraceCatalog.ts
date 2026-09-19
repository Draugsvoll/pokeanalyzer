import type { Client } from "@libsql/client";
import {
  POKETRACE_CATALOG_SCHEMA_VERSION,
  type PokeTraceCatalogCard,
  type PokeTraceCatalogResponse,
} from "../../shared/pokeTraceCatalog.js";
import { parsePokeTraceMarketComparisons } from "../../shared/pokeTraceMarketComparisons.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";

type CatalogDatabase = Pick<Client, "execute">;
type CatalogRow = Record<string, unknown>;

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function toPokeTraceCatalogCard(row: CatalogRow): PokeTraceCatalogCard {
  const comparisons = parsePokeTraceMarketComparisons(
    row.tcg_market_comparisons,
  );

  return {
    id: String(row.id),
    name: String(row.name),
    ...(optionalText(row.card_number) && {
      number: optionalText(row.card_number),
    }),
    setName: optionalText(row.set_name) ?? "Unknown set",
    ...(optionalText(row.rarity) && { rarity: optionalText(row.rarity) }),
    ...(optionalText(row.variant) && { variant: optionalText(row.variant) }),
    ...(optionalText(row.image_url) && { image: optionalText(row.image_url) }),
    currency: optionalText(row.currency) ?? "USD",
    marketPrice: positiveNumber(row.market_price),
    priceSnapshots: {
      "1d": comparisons?.comparisons["1d"]?.marketPrice ?? null,
      "7d": comparisons?.comparisons["7d"]?.marketPrice ?? null,
      "30d": comparisons?.comparisons["30d"]?.marketPrice ?? null,
    },
  };
}

export async function loadPokeTraceCatalog(
  database: CatalogDatabase = pokeTraceDb,
  ready: Promise<unknown> = ensurePokeTraceReady(),
): Promise<PokeTraceCatalogResponse> {
  await ready;
  const result = await database.execute(`
    SELECT
      id,
      name,
      card_number,
      set_name,
      rarity,
      variant,
      image_url,
      json_extract(raw_json, '$.currency') AS currency,
      json_extract(raw_json, '$.prices.tcgplayer.NEAR_MINT.avg') AS market_price,
      tcg_market_comparisons
    FROM poketrace_cards
    ORDER BY name, set_name, card_number, variant, id
  `);

  return {
    schemaVersion: POKETRACE_CATALOG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    cards: result.rows.map((row) =>
      toPokeTraceCatalogCard(row as unknown as CatalogRow),
    ),
  };
}
