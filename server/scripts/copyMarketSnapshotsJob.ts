import type { Client } from "@libsql/client";

// Only market observations are copied; target observations win on reruns.
const tables = [
  ["poketrace_market_snapshots", "card_id"],
  ["poketrace_tcg_market_prices", "card_id"],
  ["poketrace_sealed_market_snapshots", "product_id"],
  ["poketrace_sealed_tcg_market_prices", "product_id"],
] as const;

export async function copyMarketSnapshots(
  source: Pick<Client, "execute">,
  target: Pick<Client, "execute">,
  assertHeld: () => void,
  log: (message: string) => void = console.log,
) {
  for (const [table, idColumn] of tables) {
    let date = "";
    let id = "";
    let copied = 0;
    let pages = 0;
    while (true) {
      const page = await source.execute({
        sql: `SELECT * FROM ${table}
              WHERE (recorded_at, ${idColumn}) > (?, ?)
              ORDER BY recorded_at, ${idColumn} LIMIT 1000`,
        args: [date, id],
      });
      if (!page.rows.length) break;
      assertHeld();
      const columns = page.columns;
      const result = await target.execute({
        sql: `INSERT INTO ${table} (${columns.join(",")})
              SELECT ${columns.map((_, index) => `json_extract(value, '$[${index}]')`).join(",")}
              FROM json_each(?) WHERE true
              ON CONFLICT(${idColumn}, recorded_at) DO NOTHING`,
        args: [
          JSON.stringify(
            page.rows.map((row) => columns.map((column) => row[column])),
          ),
        ],
      });
      copied += result.rowsAffected;
      const last = page.rows.at(-1)!;
      date = String(last.recorded_at);
      id = String(last[idColumn]);
      if (++pages % 100 === 0) log(`${table}: ${copied} rows copied`);
    }
    log(`${table}: copied ${copied} snapshot rows`);
  }
}
