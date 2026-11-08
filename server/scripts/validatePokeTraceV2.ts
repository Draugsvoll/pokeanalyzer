import "dotenv/config";
import {
  assertExplicitPokeTraceDatabaseTarget,
  pokeTraceDb,
} from "../db/pokeTraceDb.js";

try {
  assertExplicitPokeTraceDatabaseTarget();
  for (const table of [
    "poketrace_cards",
    "poketrace_sealed_products",
  ] as const) {
    const result = await pokeTraceDb.execute(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN json_extract(raw_json, '$.markets.EU.available') = 1 THEN 1 ELSE 0 END) AS with_eu,
        SUM(CASE WHEN json_extract(raw_json, '$.markets.US.available') IS NOT 1
          OR json_type(raw_json, '$.prices') IS NOT 'object'
          OR json_type(raw_json, '$.prices.tcgplayer') IS NOT NULL
          OR json_type(raw_json, '$.prices.ebay') IS NOT NULL THEN 1 ELSE 0 END) AS invalid
      FROM ${table}
    `);
    const row = result.rows[0];
    console.log(
      `${table}: ${row.total} records, ${row.with_eu} with EU prices, ${row.invalid} invalid v2 records`,
    );
    if (!Number(row.total) || Number(row.invalid)) process.exitCode = 1;
  }
  for (const table of [
    "poketrace_catalog_payloads",
    "poketrace_sealed_catalog_payloads",
    "poketrace_market_categories",
    "poketrace_grading_opportunities",
  ]) {
    const result = await pokeTraceDb.execute(
      `SELECT COUNT(*) AS total FROM ${table}`,
    );
    console.log(`${table}: ${result.rows[0].total} published payload(s)`);
    if (!Number(result.rows[0].total)) process.exitCode = 1;
  }
} finally {
  pokeTraceDb.close();
}
