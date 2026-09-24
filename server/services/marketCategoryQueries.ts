import type { Client } from "@libsql/client";

export const MARKET_SOURCES = ["tcgplayer", "ebay"] as const;
export const MARKET_CONDITIONS = [
  "NEAR_MINT",
  "LIGHTLY_PLAYED",
  "MODERATELY_PLAYED",
  "HEAVILY_PLAYED",
  "DAMAGED",
] as const;
export const MOST_SOLD_CONDITIONS = ["ALL", ...MARKET_CONDITIONS] as const;

export type MarketSource = (typeof MARKET_SOURCES)[number];
export type MarketCondition = (typeof MARKET_CONDITIONS)[number];
export type MostSoldCondition = (typeof MOST_SOLD_CONDITIONS)[number];
export type PriceMoverDirection = "gainers" | "losers";
export type PriceMoversSort = "absolute" | "percentage";

export type PriceMoversOptions = {
  condition: MarketCondition;
  direction: PriceMoverDirection;
  limit: number;
  minimumChange: number;
  minimumChangePercent: number;
  minimumPrice: number;
  minimumSales: number;
  minimumSalesIncrease: number;
  periodDays: number;
  sortBy: PriceMoversSort;
  source: MarketSource;
};

export type PriceMover = {
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

export type PriceMoversResult = {
  comparisonSnapshotDate: string | null;
  currentSnapshotDate: string | null;
  items: PriceMover[];
  parameters: PriceMoversOptions;
  status: "insufficient_history" | "ready";
};

export type MostSoldOptions = {
  condition: MostSoldCondition;
  limit: number;
  minimumNewSales: number;
  minimumPrice: number;
  periodDays: number;
  source: MarketSource;
};

export type MostSoldItem = {
  cardId: string;
  cardNumber: string | null;
  currency: string | null;
  currentPrice: number;
  image: string | null;
  name: string;
  newSales: number;
  prices: Record<string, unknown>;
  rarity: string | null;
  setName: string | null;
  variant: string | null;
};

export type MostSoldResult = {
  comparisonSnapshotDate: string | null;
  currentSnapshotDate: string | null;
  items: MostSoldItem[];
  parameters: MostSoldOptions;
  status: "insufficient_history" | "ready";
};

type PriceMoverRow = {
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

const DEFAULT_OPTIONS: PriceMoversOptions = {
  condition: "NEAR_MINT",
  direction: "gainers",
  limit: 10,
  minimumChange: 0,
  minimumChangePercent: 0,
  minimumPrice: 20,
  minimumSales: 0,
  minimumSalesIncrease: 0,
  periodDays: 1,
  sortBy: "percentage",
  source: "tcgplayer",
};

const DEFAULT_MOST_SOLD_OPTIONS: MostSoldOptions = {
  condition: "ALL",
  limit: 10,
  minimumNewSales: 1,
  minimumPrice: 0,
  periodDays: 1,
  source: "tcgplayer",
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

export function normalizePriceMoversOptions(
  options: Partial<PriceMoversOptions> = {},
): PriceMoversOptions {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  if (!MARKET_SOURCES.includes(merged.source)) {
    throw new Error(`Unsupported market source: ${String(merged.source)}`);
  }
  if (!MARKET_CONDITIONS.includes(merged.condition)) {
    throw new Error(
      `Unsupported market condition: ${String(merged.condition)}`,
    );
  }
  if (!(["gainers", "losers"] as const).includes(merged.direction)) {
    throw new Error(`Unsupported mover direction: ${String(merged.direction)}`);
  }
  if (!(["absolute", "percentage"] as const).includes(merged.sortBy)) {
    throw new Error(`Unsupported movers sort: ${String(merged.sortBy)}`);
  }
  return {
    condition: merged.condition,
    direction: merged.direction,
    limit: integer(merged.limit, "limit", 1, 100),
    minimumChange: finiteNumber(merged.minimumChange, "minimumChange", 0),
    minimumChangePercent: finiteNumber(
      merged.minimumChangePercent,
      "minimumChangePercent",
      0,
    ),
    minimumPrice: finiteNumber(merged.minimumPrice, "minimumPrice", 0),
    minimumSales: integer(merged.minimumSales, "minimumSales", 0, 1_000_000),
    minimumSalesIncrease: integer(
      merged.minimumSalesIncrease,
      "minimumSalesIncrease",
      0,
      1_000_000,
    ),
    periodDays: integer(merged.periodDays, "periodDays", 1, 365),
    sortBy: merged.sortBy,
    source: merged.source,
  };
}

export function normalizeMostSoldOptions(
  options: Partial<MostSoldOptions> = {},
): MostSoldOptions {
  const merged = { ...DEFAULT_MOST_SOLD_OPTIONS, ...options };
  if (!MARKET_SOURCES.includes(merged.source)) {
    throw new Error(`Unsupported most-sold source: ${String(merged.source)}`);
  }
  if (!MOST_SOLD_CONDITIONS.includes(merged.condition)) {
    throw new Error(
      `Unsupported most-sold condition: ${String(merged.condition)}`,
    );
  }
  return {
    condition: merged.condition,
    limit: integer(merged.limit, "limit", 1, 100),
    minimumNewSales: integer(
      merged.minimumNewSales,
      "minimumNewSales",
      0,
      1_000_000,
    ),
    minimumPrice: finiteNumber(merged.minimumPrice, "minimumPrice", 0),
    periodDays: integer(merged.periodDays, "periodDays", 1, 365),
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

function toPriceMover(
  rawRow: Record<string, unknown>,
  options: PriceMoversOptions,
): PriceMover {
  const row = rawRow as PriceMoverRow;
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

function movementFilter(direction: PriceMoverDirection) {
  return direction === "gainers"
    ? `current.market_price > previous.market_price
      AND current.market_price - previous.market_price >= ?
      AND 100.0 * (current.market_price - previous.market_price)
        / previous.market_price >= ?`
    : `previous.market_price > current.market_price
      AND previous.market_price - current.market_price >= ?
      AND 100.0 * (previous.market_price - current.market_price)
        / previous.market_price >= ?`;
}

function movementOrder(
  direction: PriceMoverDirection,
  sortBy: PriceMoversSort,
) {
  const column = sortBy === "absolute" ? "change_abs" : "change_pct";
  return `${column} ${direction === "gainers" ? "DESC" : "ASC"}`;
}

function dedicatedNearMintQuery(
  direction: PriceMoverDirection,
  sortBy: PriceMoversSort,
) {
  const movement = movementFilter(direction);
  const order = movementOrder(direction, sortBy);
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
      CAST(
        json_extract(current_snapshot.tcg, '$.NEAR_MINT.saleCount') AS REAL
      ) AS sale_count
    FROM poketrace_tcg_market_prices AS current
    INNER JOIN poketrace_tcg_market_prices AS previous
      ON previous.card_id = current.card_id
      AND previous.recorded_at = ?
    INNER JOIN poketrace_cards AS cards ON cards.id = current.card_id
    LEFT JOIN poketrace_market_snapshots AS current_snapshot
      ON current_snapshot.card_id = current.card_id
      AND current_snapshot.recorded_at = current.recorded_at
    LEFT JOIN poketrace_market_snapshots AS previous_snapshot
      ON previous_snapshot.card_id = previous.card_id
      AND previous_snapshot.recorded_at = previous.recorded_at
    WHERE current.recorded_at = ?
      AND current.market_price >= ?
      AND previous.market_price >= ?
      AND ${movement}
      AND (
        ? = 0
        OR CAST(
          json_extract(current_snapshot.tcg, '$.NEAR_MINT.saleCount') AS REAL
        ) >= ?
      )
      AND (
        ? = 0
        OR CAST(
          json_extract(current_snapshot.tcg, '$.NEAR_MINT.saleCount') AS REAL
        ) - CAST(
          json_extract(previous_snapshot.tcg, '$.NEAR_MINT.saleCount') AS REAL
        ) >= ?
      )
    ORDER BY ${order}, change_abs ${direction === "gainers" ? "DESC" : "ASC"}, cards.id
    LIMIT ?
  `;
}

function marketSnapshotQuery(
  source: MarketSource,
  direction: PriceMoverDirection,
  sortBy: PriceMoversSort,
) {
  const marketColumn = source === "tcgplayer" ? "tcg" : "ebay";
  const movement = movementFilter(direction);
  const order = movementOrder(direction, sortBy);
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
        CAST(json_extract(${marketColumn}, ?) AS REAL) AS market_price,
        CAST(json_extract(${marketColumn}, ?) AS REAL) AS sale_count
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
      AND ${movement}
      AND (? = 0 OR current.sale_count >= ?)
      AND (
        ? = 0
        OR current.sale_count - previous.sale_count >= ?
      )
    ORDER BY ${order}, change_abs ${direction === "gainers" ? "DESC" : "ASC"}, cards.id
    LIMIT ?
  `;
}

export async function findPriceMovers(
  database: Pick<Client, "execute">,
  requestedOptions: Partial<PriceMoversOptions> = {},
): Promise<PriceMoversResult> {
  const parameters = normalizePriceMoversOptions(requestedOptions);
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
    parameters.minimumSales,
    parameters.minimumSales,
    parameters.minimumSalesIncrease,
    parameters.minimumSalesIncrease,
    parameters.limit,
  ];
  const result = useDedicatedHistory
    ? await database.execute({
        sql: dedicatedNearMintQuery(parameters.direction, parameters.sortBy),
        args: [comparisonSnapshotDate, currentSnapshotDate, ...commonArgs],
      })
    : await database.execute({
        sql: marketSnapshotQuery(
          parameters.source,
          parameters.direction,
          parameters.sortBy,
        ),
        args: [
          `$.${parameters.condition}.avg`,
          `$.${parameters.condition}.saleCount`,
          currentSnapshotDate,
          `$.${parameters.condition}.avg`,
          `$.${parameters.condition}.saleCount`,
          comparisonSnapshotDate,
          ...commonArgs,
        ],
      });

  return {
    comparisonSnapshotDate,
    currentSnapshotDate,
    items: result.rows.map((row) => toPriceMover(row, parameters)),
    parameters,
    status: "ready",
  };
}

function newSalesExpression(
  column: "ebay" | "tcg",
  conditions: readonly MarketCondition[],
) {
  const comparableSales = (snapshot: "current" | "previous") =>
    conditions
      .map(
        (condition) => `CASE
        WHEN json_type(current.${column}, '$.${condition}.saleCount')
               IN ('integer', 'real')
          AND json_type(previous.${column}, '$.${condition}.saleCount')
               IN ('integer', 'real')
        THEN CAST(
          json_extract(${snapshot}.${column}, '$.${condition}.saleCount') AS REAL
        )
        ELSE 0
      END`,
      )
      .join(" + ");

  return `MAX(
    (${comparableSales("current")}) - (${comparableSales("previous")}),
    0
  )`;
}

export async function findMostSold(
  database: Pick<Client, "execute">,
  requestedOptions: Partial<MostSoldOptions> = {},
): Promise<MostSoldResult> {
  const parameters = normalizeMostSoldOptions(requestedOptions);
  const currentSnapshotDate = await latestDate(
    database,
    "poketrace_market_snapshots",
  );
  const comparisonSnapshotDate = currentSnapshotDate
    ? dateDaysBefore(currentSnapshotDate, parameters.periodDays)
    : null;
  if (
    !currentSnapshotDate ||
    !comparisonSnapshotDate ||
    !(await snapshotDateExists(
      database,
      "poketrace_market_snapshots",
      comparisonSnapshotDate,
    ))
  ) {
    return {
      comparisonSnapshotDate,
      currentSnapshotDate,
      items: [],
      parameters,
      status: "insufficient_history",
    };
  }

  const column = parameters.source === "tcgplayer" ? "tcg" : "ebay";
  const conditions =
    parameters.condition === "ALL" ? MARKET_CONDITIONS : [parameters.condition];
  const priceCondition =
    parameters.condition === "ALL" ? "NEAR_MINT" : parameters.condition;
  const newSales = newSalesExpression(column, conditions);
  const result = await database.execute({
    sql: `
      WITH sales_by_card AS (
        SELECT
          current.card_id,
          current.currency,
          current.${column} AS prices,
          CAST(
            json_extract(current.${column}, '$.${priceCondition}.avg') AS REAL
          ) AS current_price,
          ${newSales} AS new_sales
        FROM poketrace_market_snapshots AS current
        INNER JOIN poketrace_market_snapshots AS previous
          ON previous.card_id = current.card_id
          AND previous.recorded_at = ?
        WHERE current.recorded_at = ?
      )
      SELECT
        cards.id AS card_id,
        cards.name,
        cards.card_number,
        cards.set_name,
        cards.rarity,
        cards.variant,
        cards.image_url,
        selected.currency,
        selected.prices,
        selected.current_price,
        selected.new_sales
      FROM sales_by_card AS selected
      INNER JOIN poketrace_cards AS cards ON cards.id = selected.card_id
      WHERE selected.current_price >= ?
        AND selected.new_sales >= ?
      ORDER BY selected.new_sales DESC, cards.id
      LIMIT ?
    `,
    args: [
      comparisonSnapshotDate,
      currentSnapshotDate,
      parameters.minimumPrice,
      parameters.minimumNewSales,
      parameters.limit,
    ],
  });

  return {
    comparisonSnapshotDate,
    currentSnapshotDate,
    items: result.rows.map((row) => ({
      cardId: String(row.card_id),
      cardNumber: optionalText(row.card_number),
      currency: optionalText(row.currency),
      currentPrice: Number(row.current_price),
      image: optionalText(row.image_url),
      name: String(row.name),
      newSales: Number(row.new_sales),
      prices: JSON.parse(String(row.prices)) as Record<string, unknown>,
      rarity: optionalText(row.rarity),
      setName: optionalText(row.set_name),
      variant: optionalText(row.variant),
    })),
    parameters,
    status: "ready",
  };
}
