import type { PokeTraceSealedProduct } from "./pokeTraceApi.js";

const textOrNull = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const recordOrEmpty = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function sealedProductUpsert(
  product: PokeTraceSealedProduct,
  crawlId?: string,
) {
  return {
    sql: `
      INSERT INTO poketrace_sealed_products
        (id, name, set_name, product_family, variant, image_url,
         tcgplayer_id, raw_json, fetched_at, last_seen_at, last_seen_crawl_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?,
        strftime('%Y-%m-%d %H:%M:%f', 'now'),
        strftime('%Y-%m-%d %H:%M:%f', 'now'), ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        set_name = excluded.set_name,
        product_family = excluded.product_family,
        variant = excluded.variant,
        image_url = excluded.image_url,
        tcgplayer_id = excluded.tcgplayer_id,
        raw_json = excluded.raw_json,
        fetched_at = excluded.fetched_at,
        last_seen_at = excluded.last_seen_at,
        last_seen_crawl_id = coalesce(
          excluded.last_seen_crawl_id,
          poketrace_sealed_products.last_seen_crawl_id
        )
    `,
    args: [
      product.id,
      product.name,
      textOrNull(product.set?.name),
      product.productFamily,
      textOrNull(product.variant),
      textOrNull(product.image),
      product.refs?.tcgplayerId == null
        ? null
        : String(product.refs.tcgplayerId),
      JSON.stringify(product),
      textOrNull(crawlId),
    ],
  };
}

export function sealedDailyPriceUpserts(
  product: PokeTraceSealedProduct,
  recordedAt: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    throw new Error("PokeTrace sealed snapshot date must use YYYY-MM-DD");
  }
  const prices = recordOrEmpty(product.prices);
  const tcgplayer = recordOrEmpty(prices.tcgplayer);
  const unopened = recordOrEmpty(tcgplayer.UNOPENED);
  const marketPrice = unopened.avg;
  if (typeof marketPrice !== "number" || !Number.isFinite(marketPrice)) {
    return [];
  }

  return [
    {
      sql: `
        INSERT INTO poketrace_sealed_tcg_market_prices
          (product_id, recorded_at, market_price, currency, source_updated_at,
           captured_at)
        VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
        ON CONFLICT(product_id, recorded_at) DO UPDATE SET
          market_price = excluded.market_price,
          currency = excluded.currency,
          source_updated_at = excluded.source_updated_at,
          captured_at = excluded.captured_at
      `,
      args: [
        product.id,
        recordedAt,
        marketPrice,
        textOrNull(product.currency),
        textOrNull(product.lastUpdated),
      ],
    },
  ];
}

export function sealedProductAndDailyPriceUpserts(
  product: PokeTraceSealedProduct,
  recordedAt: string,
  crawlId?: string,
) {
  return [
    sealedProductUpsert(product, crawlId),
    ...sealedDailyPriceUpserts(product, recordedAt),
  ];
}

export function obsoleteSealedProductDeletes(crawlId: string) {
  const normalizedCrawlId = crawlId.trim();
  if (!normalizedCrawlId) {
    throw new Error("PokeTrace sealed crawl ID is required for reconciliation");
  }
  const obsoleteProducts = `
    SELECT id
    FROM poketrace_sealed_products
    WHERE last_seen_crawl_id IS NULL OR last_seen_crawl_id <> ?
  `;
  return [
    {
      sql: `
        DELETE FROM poketrace_sealed_tcg_market_prices
        WHERE product_id IN (${obsoleteProducts})
      `,
      args: [normalizedCrawlId],
    },
    {
      sql: `
        DELETE FROM poketrace_sealed_products
        WHERE last_seen_crawl_id IS NULL OR last_seen_crawl_id <> ?
      `,
      args: [normalizedCrawlId],
    },
  ];
}

export function expiredSealedPricesDelete(
  recordedAt: string,
  retentionDays: number,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedAt)) {
    throw new Error("PokeTrace sealed snapshot date must use YYYY-MM-DD");
  }
  return {
    sql: `
      DELETE FROM poketrace_sealed_tcg_market_prices
      WHERE recorded_at < date(?, '-' || ? || ' days')
    `,
    args: [recordedAt, retentionDays],
  };
}
