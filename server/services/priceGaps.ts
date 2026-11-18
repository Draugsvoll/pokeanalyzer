import type { Client } from "@libsql/client";
import { PRICE_GAP_QUALIFICATIONS } from "../config/priceGaps.js";
import {
  parsePokeTraceMarketComparisons,
  type PokeTraceMarketComparisons,
} from "../../shared/pokeTraceMarketComparisons.js";

export type PriceGapOptions = {
  limit: number;
  minimumGap: number;
  minimumGapPercent: number;
  minimumPrice: number;
  minimumPsaSales: number;
  minimumTcgSales: number;
};

export type PriceGap = {
  cardId: string;
  cardNumber: string | null;
  cardmarketTrend: number;
  gap: number;
  gapPercent: number;
  higherMarket: "cardmarket" | "tcgplayer";
  image: string | null;
  marketComparisons?: PokeTraceMarketComparisons;
  name: string;
  psaSales: number;
  rarity: string | null;
  setName: string | null;
  tcgPrice: number;
  tcgSales: number;
  variant: string | null;
};

export type PriceGapsResult = {
  items: PriceGap[];
  parameters: PriceGapOptions;
  status: "ready";
};

const DEFAULT_OPTIONS: PriceGapOptions = {
  ...PRICE_GAP_QUALIFICATIONS,
  limit: 12,
};

function finiteNumber(value: unknown, label: string, minimum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be a finite number of at least ${minimum}`);
  }
  return value;
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

export function normalizePriceGapOptions(
  options: Partial<PriceGapOptions> = {},
): PriceGapOptions {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  return {
    limit: integer(merged.limit, "limit", 1, 100),
    minimumGap: finiteNumber(merged.minimumGap, "minimumGap", 0),
    minimumGapPercent: finiteNumber(
      merged.minimumGapPercent,
      "minimumGapPercent",
      0,
    ),
    minimumPrice: finiteNumber(merged.minimumPrice, "minimumPrice", 0),
    minimumPsaSales: integer(
      merged.minimumPsaSales,
      "minimumPsaSales",
      0,
      1_000_000,
    ),
    minimumTcgSales: integer(
      merged.minimumTcgSales,
      "minimumTcgSales",
      0,
      1_000_000,
    ),
  };
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return number;
}

export async function findPriceGaps(
  database: Pick<Client, "execute">,
  options: Partial<PriceGapOptions> = {},
): Promise<PriceGapsResult> {
  const parameters = normalizePriceGapOptions(options);
  const result = await database.execute({
    sql: `
      WITH gaps AS (
        SELECT
          id,
          name,
          card_number,
          set_name,
          rarity,
          variant,
          image_url,
          tcg_market_comparisons,
          CAST(json_extract(raw_json, '$.prices.NEAR_MINT.US.tcgplayer.avg') AS REAL) AS tcg_price,
          CAST(json_extract(raw_json, '$.prices.NEAR_MINT.US.tcgplayer.saleCount') AS REAL) AS tcg_sales,
          CAST(json_extract(raw_json, '$.prices.AGGREGATED.EU.cardmarket.avg') AS REAL) AS cardmarket_trend,
          CAST(json_extract(raw_json, '$.prices.AGGREGATED.EU.cardmarket.avg30d') AS REAL) AS cardmarket_avg30d,
          CAST(json_extract(raw_json, '$.prices.PSA_10.US.ebay.saleCount') AS REAL) AS psa_sales
        FROM poketrace_cards
        WHERE json_type(raw_json, '$.prices.NEAR_MINT.US.tcgplayer.avg') IN ('integer', 'real')
          AND json_type(raw_json, '$.prices.NEAR_MINT.US.tcgplayer.saleCount') IN ('integer', 'real')
          AND json_type(raw_json, '$.prices.AGGREGATED.EU.cardmarket.avg') IN ('integer', 'real')
          AND json_type(raw_json, '$.prices.AGGREGATED.EU.cardmarket.avg30d') IN ('integer', 'real')
          AND json_type(raw_json, '$.prices.PSA_10.US.ebay.saleCount') IN ('integer', 'real')
      )
      SELECT
        id,
        name,
        card_number,
        set_name,
        rarity,
        variant,
        image_url,
        tcg_market_comparisons,
        tcg_price,
        tcg_sales,
        cardmarket_trend,
        cardmarket_avg30d,
        psa_sales,
        ABS(tcg_price - cardmarket_avg30d) AS gap,
        ABS(tcg_price - cardmarket_avg30d) / tcg_price * 100 AS gap_percent
      FROM gaps
      WHERE tcg_price >= ?
        AND cardmarket_trend > 0
        AND cardmarket_avg30d > 0
        AND tcg_sales >= ?
        AND psa_sales >= ?
        AND ABS(tcg_price - cardmarket_trend) >= ?
        AND ABS(tcg_price - cardmarket_trend) / tcg_price * 100 >= ?
        AND ABS(tcg_price - cardmarket_avg30d) >= ?
        AND ABS(tcg_price - cardmarket_avg30d) / tcg_price * 100 >= ?
        AND cardmarket_trend <= cardmarket_avg30d * 1.5
        AND cardmarket_trend >= cardmarket_avg30d * 0.5
      ORDER BY gap DESC, gap_percent DESC, id
      LIMIT ?
    `,
    args: [
      parameters.minimumPrice,
      parameters.minimumTcgSales,
      parameters.minimumPsaSales,
      parameters.minimumGap,
      parameters.minimumGapPercent,
      parameters.minimumGap,
      parameters.minimumGapPercent,
      parameters.limit,
    ],
  });

  return {
    items: result.rows.map((row) => {
      const tcgPrice = positiveNumber(row.tcg_price, "TCGPlayer price");
      const cardmarketTrend = positiveNumber(
        row.cardmarket_trend,
        "Cardmarket trend",
      );
      const cardmarketAverage30d = positiveNumber(
        row.cardmarket_avg30d,
        "Cardmarket 30-day average",
      );
      const marketComparisons = parsePokeTraceMarketComparisons(
        row.tcg_market_comparisons,
      );
      return {
        cardId: String(row.id),
        cardNumber: optionalText(row.card_number),
        cardmarketTrend,
        gap: positiveNumber(row.gap, "price gap"),
        gapPercent: positiveNumber(row.gap_percent, "price gap percent"),
        higherMarket:
          tcgPrice >= cardmarketAverage30d ? "tcgplayer" : "cardmarket",
        image: optionalText(row.image_url),
        ...(marketComparisons && { marketComparisons }),
        name: String(row.name),
        psaSales: positiveNumber(row.psa_sales, "PSA 10 sales"),
        rarity: optionalText(row.rarity),
        setName: optionalText(row.set_name),
        tcgPrice,
        tcgSales: positiveNumber(row.tcg_sales, "TCGPlayer sales"),
        variant: optionalText(row.variant),
      };
    }),
    parameters,
    status: "ready",
  };
}
