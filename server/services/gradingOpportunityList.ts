import type { Client } from "@libsql/client";
import {
  GRADING_LIST_SERVER_TTL_MS,
  isGradingOpportunityListFresh,
  parseGradingOpportunityList,
  type GradingOpportunityList,
} from "../../shared/gradingOpportunityList.js";

type Database = Pick<Client, "execute">;

export async function ensureGradingOpportunityListStore(database: Database) {
  await database.execute(`CREATE TABLE IF NOT EXISTS poketrace_grading_opportunities (
    id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
  )`);
}

export async function saveGradingOpportunityList(
  database: Database,
  list: GradingOpportunityList,
) {
  const payload = parseGradingOpportunityList(list);
  // One upsert replaces the entire snapshot atomically, including empty lists.
  await database.execute({
    sql: `INSERT INTO poketrace_grading_opportunities (id, payload_json) VALUES ('current', ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`,
    args: [JSON.stringify(payload)],
  });
}

export async function loadGradingOpportunityList(database: Database) {
  const result = await database.execute(
    "SELECT payload_json FROM poketrace_grading_opportunities WHERE id = 'current'",
  );
  const json = result.rows[0]?.payload_json;
  return typeof json === "string"
    ? parseGradingOpportunityList(JSON.parse(json))
    : null;
}

export function createGradingOpportunityListCache(
  load: () => Promise<GradingOpportunityList | null>,
  now = Date.now,
) {
  let cached:
    { loadedAt: number; list: GradingOpportunityList | null } | undefined;
  let pending: Promise<GradingOpportunityList | null> | undefined;
  return async () => {
    if (!cached || now() - cached.loadedAt >= GRADING_LIST_SERVER_TTL_MS) {
      pending ??= load()
        .then((list) => {
          cached = { list, loadedAt: now() };
          return list;
        })
        .finally(() => {
          pending = undefined;
        });
      await pending;
    }
    const list = cached?.list;
    return list && isGradingOpportunityListFresh(list, now()) ? list : null;
  };
}
