import type { Client } from "@libsql/client";

export type PokeTraceRefreshCandidate = {
  id: string;
  tcgplayerId: string | null;
  failures: number;
};

export async function loadOldestPokeTraceRefreshCandidates(
  database: Pick<Client, "execute">,
  limit: number,
  now = new Date().toISOString(),
): Promise<PokeTraceRefreshCandidate[]> {
  const result = await database.execute({
    sql: `
      SELECT id, tcgplayer_id, price_refresh_failures
      FROM poketrace_cards
      WHERE (
          price_refreshed_at IS NULL
          OR substr(price_refreshed_at, 1, 10) < substr(?, 1, 10)
        )
        AND (price_refresh_retry_at IS NULL OR price_refresh_retry_at <= ?)
      ORDER BY
        CASE WHEN price_refreshed_at IS NULL THEN 0 ELSE 1 END,
        price_refreshed_at,
        id
      LIMIT ?
    `,
    args: [now, now, limit],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    tcgplayerId: row.tcgplayer_id == null ? null : String(row.tcgplayer_id),
    failures: Number(row.price_refresh_failures ?? 0),
  }));
}
