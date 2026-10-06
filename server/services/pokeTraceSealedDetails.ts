import type { Client } from "@libsql/client";
import type {
  PokeTraceSealedDetails,
  PokeTraceSealedCatalogProduct,
  PokeTraceSealedMarketplacePricing,
} from "../../shared/pokeTraceSealed.js";
import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import {
  isEnglishUsSealedProduct,
  type PokeTraceSealedProduct,
} from "./pokeTraceApi.js";

type DetailsDatabase = Pick<Client, "execute">;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function marketplacePricing(value: unknown): PokeTraceSealedMarketplacePricing {
  const unopened = record(record(value).UNOPENED);
  return {
    price: number(unopened.avg),
    average1d: number(unopened.avg1d),
    average7d: number(unopened.avg7d),
    average30d: number(unopened.avg30d),
    low: number(unopened.low),
    high: number(unopened.high),
    median3d: number(unopened.median3d),
    median7d: number(unopened.median7d),
    median30d: number(unopened.median30d),
    saleCount: number(unopened.saleCount),
    approxSaleCount:
      typeof unopened.approxSaleCount === "boolean"
        ? unopened.approxSaleCount
        : null,
    lastUpdated: text(unopened.lastUpdated),
  };
}

function hasPriceData(pricing: PokeTraceSealedMarketplacePricing) {
  return [
    pricing.price,
    pricing.average1d,
    pricing.average7d,
    pricing.average30d,
    pricing.low,
    pricing.high,
    pricing.median3d,
    pricing.median7d,
    pricing.median30d,
    pricing.saleCount,
  ].some((value) => value !== null);
}

function identifier(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function marketplaceUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function dateOffset(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function comparisonPrice(
  snapshots: Map<string, number>,
  asOf: string,
  days: number,
) {
  const target = dateOffset(asOf, -days);
  return (
    snapshots.get(target) ??
    snapshots.get(dateOffset(target, -1)) ??
    snapshots.get(dateOffset(target, 1)) ??
    null
  );
}

export function toPokeTraceSealedDetails(
  product: PokeTraceSealedProduct,
  priceSnapshots: PokeTraceSealedCatalogProduct["priceSnapshots"],
): PokeTraceSealedDetails {
  const prices = record(product.prices);
  const tcgplayerPricing = marketplacePricing(prices.tcgplayer);
  const ebayPricing = marketplacePricing(prices.ebay);
  const refs = record(product.refs);
  const urls = record(product.marketplaceUrls);
  const set = record(product.set);
  const variant = text(product.variant);
  const image = text(product.image);
  const setSlug = text(set.slug);
  const tcgplayerUrl = marketplaceUrl(urls.tcgplayer);
  const cardmarketUrl = marketplaceUrl(urls.cardmarket);
  const ebayUrl = marketplaceUrl(urls.ebay);

  return {
    id: product.id,
    name: product.name,
    setName: text(set.name) ?? "Unknown set",
    productFamily: product.productFamily,
    ...(variant && { variant }),
    ...(image && { image }),
    currency: text(product.currency) ?? "USD",
    price: tcgplayerPricing.price,
    priceSnapshots,
    ...(text(product.lastUpdated) && {
      lastUpdated: text(product.lastUpdated) ?? undefined,
    }),
    ...(setSlug && { setSlug }),
    refs: {
      tcgplayerId: identifier(refs.tcgplayerId),
      cardmarketId: identifier(refs.cardmarketId),
    },
    marketplaceUrls: {
      ...(tcgplayerUrl && { tcgplayer: tcgplayerUrl }),
      ...(cardmarketUrl && { cardmarket: cardmarketUrl }),
      ...(ebayUrl && { ebay: ebayUrl }),
    },
    pricing: {
      tcgplayer: tcgplayerPricing,
      ...(hasPriceData(ebayPricing) && { ebay: ebayPricing }),
    },
  };
}

export async function loadPokeTraceSealedDetails(
  productId: string,
  dependencies: Partial<{
    database: DetailsDatabase;
    ensureReady: () => Promise<void>;
    now: () => Date;
  }> = {},
) {
  const database = dependencies.database ?? pokeTraceDb;
  await (dependencies.ensureReady ?? ensurePokeTraceReady)();
  const productResult = await database.execute({
    sql: "SELECT raw_json FROM poketrace_sealed_products WHERE id = ?",
    args: [productId],
  });
  const rawJson = productResult.rows[0]?.raw_json;
  if (typeof rawJson !== "string") return null;

  let product: unknown;
  try {
    product = JSON.parse(rawJson);
  } catch {
    return null;
  }
  if (!isEnglishUsSealedProduct(product) || product.id !== productId) {
    return null;
  }

  const asOf = (dependencies.now?.() ?? new Date()).toISOString().slice(0, 10);
  const snapshotsResult = await database.execute({
    sql: `
      SELECT recorded_at, market_price
      FROM poketrace_sealed_tcg_market_prices
      WHERE product_id = ?
        AND recorded_at >= date(?, '-31 days')
        AND recorded_at <= ?
    `,
    args: [productId, asOf, asOf],
  });
  const snapshots = new Map(
    snapshotsResult.rows.map((row) => [
      String(row.recorded_at),
      Number(row.market_price),
    ]),
  );
  return toPokeTraceSealedDetails(product, {
    "1d": comparisonPrice(snapshots, asOf, 1),
    "7d": comparisonPrice(snapshots, asOf, 7),
    "30d": comparisonPrice(snapshots, asOf, 30),
  });
}
