import type { Client } from "@libsql/client";

export const MARKET_SOURCES = ["tcgplayer", "ebay"] as const;
export const MOST_SOLD_SOURCES = ["tcgplayer", "ebay", "both"] as const;
export const MARKET_CONDITIONS = [
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "DAMAGED",
] as const;

export type MarketSource = (typeof MARKET_SOURCES)[number];
export type MostSoldSource = (typeof MOST_SOLD_SOURCES)[number];
export type MarketCondition = (typeof MARKET_CONDITIONS)[number];
export type PriceGainersSort = "absolute" | "percentage";

export type PriceGainersOptions = {
  condition: MarketCondition;
  limit: number;
  minimumChange: number;
  minimumChangePercent: number;
  minimumPrice: number;
  periodDays: number;
  sortBy: PriceGainersSort;
  source: MarketSource;
};

export type PriceGainer = {
  cardId: string;
  cardNumber: string | null;
  change: number;
  changePercent: number;
  condition: MarketCondition;
  currency: string | null;
  currentPrice: number;
  image: string | null;
  name: string;
  previousPrice: number;
  rarity: string | null;
  saleCount: number | null;
  setName: string | null;
  source: MarketSource;
  variant: string | null;
};

export type PriceGainersResult = {
  comparisonSnapshotDate: string | null;
  currentSnapshotDate: string | null;
  items: PriceGainer[];
  parameters: PriceGainersOptions;
  status: "insufficient_history" | "ready";
};

export type MostSoldOptions = {
  limit: number;
  minimumPrice: number;
  minimumSales: number;
  source: MostSoldSource;
};

export type MostSoldItem = {
  cardId: string;
  cardNumber: string | null;
  ebaySales: number;
  image: string | null;
  name: string;
  rarity: string | null;
  setName: string | null;
  tcgplayerSales: number;
  totalSales: number;
  variant: string | null;
};

export type MostSoldResult = {
  items: MostSoldItem[];
  parameters: MostSoldOptions;
  snapshotDate: string | null;
  status: "insufficient_history" | "ready";
};

type PriceGainerRow = {
  card_id: unknown;
  card_number: unknown;
  change_abs: unknown;
  change_pct: unknown;
  currency: unknown;
  current_price: unknown;
  image_url: unknown;
  name: unknown;
  previous_price: unknown;
  rarity: unknown;
  sale_count: unknown;
  set_name: unknown;
  variant: unknown;
};

const DEFAULT_OPTIONS: PriceGainersOptions = {
  condition: "NEAR_MINT",
  limit: 10,
  minimumChange: 0,
  minimumChangePercent: 0,
  minimumPrice: 20,
  periodDays: 1,
  sortBy: "percentage",
  source: "tcgplayer",
};

const DEFAULT_MOST_SOLD_OPTIONS: MostSoldOptions = {
  limit: 10,
  minimumPrice: 0,
  minimumSales: 1,
  source: "both",
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
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

export function normalizePriceGainersOptions(
  options: Partial<PriceGainersOptions> = {},
): PriceGainersOptions {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  if (!MARKET_SOURCES.includes(merged.source)) {
    throw new Error(`Unsupported market source: ${String(merged.source)}`);
  }
  if (!MARKET_CONDITIONS.includes(merged.condition)) {
    throw new Error(
      `Unsupported market condition: ${String(merged.condition)}`,
    );
  }
  if (!(["absolute", "percentage"] as const).includes(merged.sortBy)) {
    throw new Error(`Unsupported gainers sort: ${String(merged.sortBy)}`);
  }
  return {
    condition: merged.condition,
    limit: integer(merged.limit, "limit", 1, 100),
    minimumChange: finiteNumber(merged.minimumChange, "minimumChange", 0),
    minimumChangePercent: finiteNumber(
      merged.minimumChangePercent,
      "minimumChangePercent",
      0,
    ),
    minimumPrice: finiteNumber(merged.minimumPrice, "minimumPrice", 0),
    periodDays: integer(merged.periodDays, "periodDays", 1, 365),
    sortBy: merged.sortBy,
    source: merged.source,
  };
}

export function normalizeMostSoldOptions(
  options: Partial<MostSoldOptions> = {},
): MostSoldOptions {
  const merged = { ...DEFAULT_MOST_SOLD_OPTIONS, ...options };
  if (!MOST_SOLD_SOURCES.includes(merged.source)) {
    throw new Error(`Unsupported most-sold source: ${String(merged.source)}`);
  }
  return {
    limit: integer(merged.limit, "limit", 1, 100),
    minimumPrice: finiteNumber(merged.minimumPrice, "minimumPrice", 0),
    minimumSales: finiteNumber(merged.minimumSales, "minimumSales", 0),
    source: merged.source,
  };
}

function dateDaysBefore(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return parsed.toISOString().slice(0, 10);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function toPriceGainer(
  rawRow: Record<string, unknown>,
  options: PriceGainersOptions,
): PriceGainer {
  const row = rawRow as PriceGainerRow;
  return {
    cardId: String(row.card_id),
    cardNumber: optionalText(row.card_number),
    change: Number(row.change_abs),
    changePercent: Number(row.change_pct),
    condition: options.condition,
    currency: optionalText(row.currency),
    currentPrice: Number(row.current_price),
    image: optionalText(row.image_url),
    name: String(row.name),
    previousPrice: Number(row.previous_price),
    rarity: optionalText(row.rarity),
    saleCount: row.sale_count == null ? null : Number(row.sale_count),
    setName: optionalText(row.set_name),
    source: options.source,
    variant: optionalText(row.variant),
  };
}

async function latestDate(
  database: Pick<Client, "execute">,
  table: "poketrace_market_snapshots" | "poketrace_tcg_market_prices",
) {
  const result = await database.execute(
    `SELECT MAX(recorded_at) AS recorded_at FROM ${table}`,
  );
  const value = result.rows[0]?.recorded_at;
  return typeof value === "string" ? value : null;
}

async function snapshotDateExists(
  database: Pick<Client, "execute">,
  table: "poketrace_market_snapshots" | "poketrace_tcg_market_prices",
  date: string,
) {
  const result = await database.execute({
    sql: `SELECT 1 AS found FROM ${table} WHERE recorded_at = ? LIMIT 1`,
    args: [date],
  });
  return result.rows.length > 0;
}

function dedicatedNearMintQuery(sortBy: PriceGainersSort) {
  const order = sortBy === "absolute" ? "change_abs" : "change_pct";
  return `
    SELECT
      cards.id AS card_id,
      cards.name,
      cards.card_number,
      cards.set_name,
      cards.rarity,
      cards.variant,
      cards.image_url,
      current.currency,
      current.market_price AS current_price,
      previous.market_price AS previous_price,
      ROUND(current.market_price - previous.market_price, 2) AS change_abs,
      ROUND(
        100.0 * (current.market_price - previous.market_price)
          / previous.market_price,
        2
      ) AS change_pct,
      NULL AS sale_count
    FROM poketrace_tcg_market_prices AS current
    INNER JOIN poketrace_tcg_market_prices AS previous
      ON previous.card_id = current.card_id
      AND previous.recorded_at = ?
    INNER JOIN poketrace_cards AS cards ON cards.id = current.card_id
    WHERE current.recorded_at = ?
      AND current.market_price >= ?
      AND previous.market_price >= ?
      AND current.market_price - previous.market_price >= ?
      AND 100.0 * (current.market_price - previous.market_price)
        / previous.market_price >= ?
    ORDER BY ${order} DESC, change_abs DESC, cards.id
    LIMIT ?
  `;
}

function marketSnapshotQuery(source: MarketSource, sortBy: PriceGainersSort) {
  const marketColumn = source === "tcgplayer" ? "tcg" : "ebay";
  const order = sortBy === "absolute" ? "change_abs" : "change_pct";
  return `
    WITH current_prices AS (
      SELECT
        card_id,
        currency,
        CAST(json_extract(${marketColumn}, ?) AS REAL) AS market_price,
        CAST(json_extract(${marketColumn}, ?) AS REAL) AS sale_count
      FROM poketrace_market_snapshots
      WHERE recorded_at = ?
    ),
    previous_prices AS (
      SELECT
        card_id,
        CAST(json_extract(${marketColumn}, ?) AS REAL) AS market_price
      FROM poketrace_market_snapshots
      WHERE recorded_at = ?
    )
    SELECT
      cards.id AS card_id,
      cards.name,
      cards.card_number,
      cards.set_name,
      cards.rarity,
      cards.variant,
      cards.image_url,
      current.currency,
      current.market_price AS current_price,
      previous.market_price AS previous_price,
      ROUND(current.market_price - previous.market_price, 2) AS change_abs,
      ROUND(
        100.0 * (current.market_price - previous.market_price)
          / previous.market_price,
        2
      ) AS change_pct,
      current.sale_count
    FROM current_prices AS current
    INNER JOIN previous_prices AS previous ON previous.card_id = current.card_id
    INNER JOIN poketrace_cards AS cards ON cards.id = current.card_id
    WHERE current.market_price >= ?
      AND previous.market_price >= ?
      AND current.market_price - previous.market_price >= ?
      AND 100.0 * (current.market_price - previous.market_price)
        / previous.market_price >= ?
    ORDER BY ${order} DESC, change_abs DESC, cards.id
    LIMIT ?
  `;
}

export async function findPriceGainers(
  database: Pick<Client, "execute">,
  requestedOptions: Partial<PriceGainersOptions> = {},
): Promise<PriceGainersResult> {
  const parameters = normalizePriceGainersOptions(requestedOptions);
  const useDedicatedHistory =
    parameters.source === "tcgplayer" && parameters.condition === "NEAR_MINT";
  const historyTable = useDedicatedHistory
    ? "poketrace_tcg_market_prices"
    : "poketrace_market_snapshots";
  const currentSnapshotDate = await latestDate(database, historyTable);
  const comparisonSnapshotDate = currentSnapshotDate
    ? dateDaysBefore(currentSnapshotDate, parameters.periodDays)
    : null;

  if (
    !currentSnapshotDate ||
    !comparisonSnapshotDate ||
    !(await snapshotDateExists(database, historyTable, comparisonSnapshotDate))
  ) {
    return {
      comparisonSnapshotDate,
      currentSnapshotDate,
      items: [],
      parameters,
      status: "insufficient_history",
    };
  }

  const commonArgs = [
    parameters.minimumPrice,
    parameters.minimumPrice,
    parameters.minimumChange,
    parameters.minimumChangePercent,
    parameters.limit,
  ];
  const result = useDedicatedHistory
    ? await database.execute({
        sql: dedicatedNearMintQuery(parameters.sortBy),
        args: [comparisonSnapshotDate, currentSnapshotDate, ...commonArgs],
      })
    : await database.execute({
        sql: marketSnapshotQuery(parameters.source, parameters.sortBy),
        args: [
          `$.${parameters.condition}.avg`,
          `$.${parameters.condition}.saleCount`,
          currentSnapshotDate,
          `$.${parameters.condition}.avg`,
          comparisonSnapshotDate,
          ...commonArgs,
        ],
      });

  return {
    comparisonSnapshotDate,
    currentSnapshotDate,
    items: result.rows.map((row) => toPriceGainer(row, parameters)),
    parameters,
    status: "ready",
  };
}

function salesExpression(column: "ebay" | "tcg") {
  return MARKET_CONDITIONS.map(
    (condition) =>
      `CASE
        WHEN CAST(json_extract(${column}, '$.${condition}.avg') AS REAL) >= ?
        THEN COALESCE(
          CAST(json_extract(${column}, '$.${condition}.saleCount') AS REAL),
          0
        )
        ELSE 0
      END`,
  ).join(" + ");
}

export async function findMostSold(
  database: Pick<Client, "execute">,
  requestedOptions: Partial<MostSoldOptions> = {},
): Promise<MostSoldResult> {
  const parameters = normalizeMostSoldOptions(requestedOptions);
  const snapshotDate = await latestDate(database, "poketrace_market_snapshots");
  if (!snapshotDate) {
    return {
      items: [],
      parameters,
      snapshotDate: null,
      status: "insufficient_history",
    };
  }

  const tcgplayerSales = salesExpression("tcg");
  const ebaySales = salesExpression("ebay");
  const selectedSales =
    parameters.source === "tcgplayer"
      ? "tcgplayer_sales"
      : parameters.source === "ebay"
        ? "ebay_sales"
        : "tcgplayer_sales + ebay_sales";
  const result = await database.execute({
    sql: `
      WITH sales_by_card AS (
        SELECT
          card_id,
          ${tcgplayerSales} AS tcgplayer_sales,
          ${ebaySales} AS ebay_sales
        FROM poketrace_market_snapshots
        WHERE recorded_at = ?
      ),
      selected_sales AS (
        SELECT
          card_id,
          tcgplayer_sales,
          ebay_sales,
          ${selectedSales} AS total_sales
        FROM sales_by_card
      )
      SELECT
        cards.id AS card_id,
        cards.name,
        cards.card_number,
        cards.set_name,
        cards.rarity,
        cards.variant,
        cards.image_url,
        selected.tcgplayer_sales,
        selected.ebay_sales,
        selected.total_sales
      FROM selected_sales AS selected
      INNER JOIN poketrace_cards AS cards ON cards.id = selected.card_id
      WHERE selected.total_sales >= ?
      ORDER BY selected.total_sales DESC, cards.id
      LIMIT ?
    `,
    args: [
      ...MARKET_CONDITIONS.map(() => parameters.minimumPrice),
      ...MARKET_CONDITIONS.map(() => parameters.minimumPrice),
      snapshotDate,
      parameters.minimumSales,
      parameters.limit,
    ],
  });

  return {
    items: result.rows.map((row) => ({
      cardId: String(row.card_id),
      cardNumber: optionalText(row.card_number),
      ebaySales: Number(row.ebay_sales),
      image: optionalText(row.image_url),
      name: String(row.name),
      rarity: optionalText(row.rarity),
      setName: optionalText(row.set_name),
      tcgplayerSales: Number(row.tcgplayer_sales),
      totalSales: Number(row.total_sales),
      variant: optionalText(row.variant),
    })),
    parameters,
    snapshotDate,
    status: "ready",
  };
}
