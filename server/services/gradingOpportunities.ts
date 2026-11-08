import type { Client } from "@libsql/client";
import { GRADING_OPPORTUNITY_QUALIFICATIONS } from "../config/gradingOpportunities.js";
import {
  parsePokeTraceMarketComparisons,
  type PokeTraceMarketComparisons,
} from "../../shared/pokeTraceMarketComparisons.js";

export type GradingMedianWindow = "7d" | "30d";

export type GradingOpportunitiesOptions = {
  limit: number | null;
  maximumUpdateAgeDays: number;
  minimumNearMintPrice: number;
  minimumNearMintSales: number;
  minimumPsaPriceIncrease: number;
  minimumPsaSales: number;
};

export type GradingOpportunity = {
  tcgPrices: Record<string, unknown>;
  marketComparisons?: PokeTraceMarketComparisons;
  cardId: string;
  cardNumber: string | null;
  currency: string | null;
  image: string | null;
  multiplier: number;
  name: string;
  nearMintPrice: number;
  nearMintSales: number;
  priceIncrease: number;
  psaMedian: GradingMedianWindow;
  psaPrice: number;
  psaSales: number;
  rarity: string | null;
  setName: string | null;
  variant: string | null;
};

export type GradingOpportunitiesResult = {
  items: GradingOpportunity[];
  parameters: GradingOpportunitiesOptions;
  status: "ready";
  updatedAfter: string;
};

const DEFAULT_OPTIONS: GradingOpportunitiesOptions = {
  ...GRADING_OPPORTUNITY_QUALIFICATIONS,
  limit: 12,
};

const DAY_MS = 86_400_000;

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

export function normalizeGradingOpportunitiesOptions(
  options: Partial<GradingOpportunitiesOptions> = {},
): GradingOpportunitiesOptions {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  return {
    limit:
      merged.limit === null ? null : integer(merged.limit, "limit", 1, 100),
    maximumUpdateAgeDays: integer(
      merged.maximumUpdateAgeDays,
      "maximumUpdateAgeDays",
      1,
      365,
    ),
    minimumNearMintPrice: finiteNumber(
      merged.minimumNearMintPrice,
      "minimumNearMintPrice",
      0,
    ),
    minimumNearMintSales: integer(
      merged.minimumNearMintSales,
      "minimumNearMintSales",
      0,
      1_000_000,
    ),
    minimumPsaPriceIncrease: finiteNumber(
      merged.minimumPsaPriceIncrease,
      "minimumPsaPriceIncrease",
      0,
    ),
    minimumPsaSales: integer(
      merged.minimumPsaSales,
      "minimumPsaSales",
      0,
      1_000_000,
    ),
  };
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function medianWindow(value: unknown): GradingMedianWindow {
  if (value === "7d" || value === "30d") return value;
  throw new Error("Grading opportunity is missing a median window");
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Grading opportunity has an invalid ${label}`);
  }
  return number;
}

const priceValue = (path: string) => {
  return `CASE
    WHEN json_type(raw_json, '$.prices.${path}') IN ('integer', 'real')
      AND CAST(json_extract(raw_json, '$.prices.${path}') AS REAL) > 0
    THEN CAST(json_extract(raw_json, '$.prices.${path}') AS REAL)
  END`;
};

export async function findGradingOpportunities(
  database: Pick<Client, "execute">,
  requestedOptions: Partial<GradingOpportunitiesOptions> = {},
): Promise<GradingOpportunitiesResult> {
  const parameters = normalizeGradingOpportunitiesOptions(requestedOptions);
  const updatedAfter = new Date(
    new Date().getTime() - parameters.maximumUpdateAgeDays * DAY_MS,
  ).toISOString();
  const nearMintPrice = priceValue("NEAR_MINT.US.tcgplayer.avg");
  const psaPrice = priceValue("PSA_10.US.ebay.median30d");

  const result = await database.execute({
    sql: `
      WITH opportunities AS (
        SELECT
          id,
          name,
          card_number,
          set_name,
          rarity,
          variant,
          image_url,
          tcg_market_comparisons,
          (SELECT json_group_object(key, json_extract(value, '$.US.tcgplayer')) FROM json_each(raw_json, '$.prices') WHERE json_type(value, '$.US.tcgplayer') = 'object') AS tcg_prices,
          json_extract(raw_json, '$.currency') AS currency,
          CAST(json_extract(raw_json, '$.prices.NEAR_MINT.US.tcgplayer.saleCount') AS REAL) AS near_mint_sales,
          CAST(json_extract(raw_json, '$.prices.PSA_10.US.ebay.saleCount') AS REAL) AS psa_sales,
          ${nearMintPrice} AS near_mint_price,
          ${psaPrice} AS psa_price,
          ${priceValue("PSA_10.US.ebay.median3d")} AS psa_median_3d,
          ${priceValue("PSA_10.US.ebay.median7d")} AS psa_median_7d,
          '30d' AS psa_median
        FROM poketrace_cards
        WHERE json_type(raw_json, '$.prices.NEAR_MINT.US.tcgplayer.saleCount') IN ('integer', 'real')
          AND json_type(raw_json, '$.prices.PSA_10.US.ebay.saleCount') IN ('integer', 'real')
          AND json_type(raw_json, '$.prices.NEAR_MINT.US.tcgplayer.lastUpdated') = 'text'
          AND json_type(raw_json, '$.prices.PSA_10.US.ebay.lastUpdated') = 'text'
          AND json_extract(raw_json, '$.prices.NEAR_MINT.US.tcgplayer.lastUpdated') >= ?
          AND json_extract(raw_json, '$.prices.PSA_10.US.ebay.lastUpdated') >= ?
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
        tcg_prices,
        currency,
        near_mint_sales,
        psa_sales,
        near_mint_price,
        psa_price,
        psa_median,
        psa_price - near_mint_price AS price_increase,
        psa_price / near_mint_price AS multiplier
      FROM opportunities
      WHERE near_mint_sales >= ?
        AND psa_sales >= ?
        AND NOT COALESCE(psa_median_3d = psa_median_7d AND psa_median_7d = psa_price, 0)
        AND near_mint_price >= ?
        AND psa_price - near_mint_price >= ?
      ORDER BY multiplier DESC, price_increase DESC, id
      LIMIT ?
    `,
    args: [
      updatedAfter,
      updatedAfter,
      parameters.minimumNearMintSales,
      parameters.minimumPsaSales,
      parameters.minimumNearMintPrice,
      parameters.minimumPsaPriceIncrease,
      parameters.limit ?? -1,
    ],
  });

  return {
    items: result.rows.map((row) => ({
      tcgPrices: row.tcg_prices
        ? (JSON.parse(String(row.tcg_prices)) as Record<string, unknown>)
        : {},
      marketComparisons: parsePokeTraceMarketComparisons(
        row.tcg_market_comparisons,
      ),
      cardId: String(row.id),
      cardNumber: optionalText(row.card_number),
      currency: optionalText(row.currency),
      image: optionalText(row.image_url),
      multiplier: positiveNumber(row.multiplier, "multiplier"),
      name: String(row.name),
      nearMintPrice: positiveNumber(row.near_mint_price, "Near Mint price"),
      nearMintSales: positiveNumber(row.near_mint_sales, "Near Mint sales"),
      priceIncrease: positiveNumber(row.price_increase, "price increase"),
      psaMedian: medianWindow(row.psa_median),
      psaPrice: positiveNumber(row.psa_price, "PSA 10 price"),
      psaSales: positiveNumber(row.psa_sales, "PSA 10 sales"),
      rarity: optionalText(row.rarity),
      setName: optionalText(row.set_name),
      variant: optionalText(row.variant),
    })),
    parameters,
    status: "ready",
    updatedAfter,
  };
}
