import { ensurePokeTraceReady, pokeTraceDb } from "../db/pokeTraceDb.js";
import { fetchPokeTraceCard } from "./pokeTraceApi.js";
import {
  isPokeTracePopulationFresh,
  parsePokeTracePsaPopulation,
} from "../../shared/pokeTracePopulation.js";

const inflight = new Map<string, Promise<boolean>>();

type PopulationDatabase = Pick<typeof pokeTraceDb, "execute">;

type PopulationRefreshDependencies = {
  database?: PopulationDatabase;
  ready?: Promise<unknown>;
  apiKey?: string;
  now?: () => number;
  fetchCard?: typeof fetchPokeTraceCard;
};

function parseRawJson(value: unknown) {
  const parsed =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

export async function refreshStoredPokeTracePopulation(
  id: string,
  dependencies: PopulationRefreshDependencies = {},
) {
  const pending = inflight.get(id);
  if (pending) return pending;
  const run = refreshStoredPokeTracePopulationOnce(id, dependencies).finally(
    () => {
      inflight.delete(id);
    },
  );
  inflight.set(id, run);
  return run;
}

async function refreshStoredPokeTracePopulationOnce(
  id: string,
  dependencies: PopulationRefreshDependencies,
) {
  const database = dependencies.database ?? pokeTraceDb;
  await (dependencies.ready ?? ensurePokeTraceReady());
  const result = await database.execute({
    sql: "SELECT raw_json FROM poketrace_cards WHERE id = ?",
    args: [id],
  });
  const raw = parseRawJson(result.rows[0]?.raw_json);
  if (!raw) return false;
  const population = parsePokeTracePsaPopulation(raw.population);
  const checkedAt =
    typeof raw.populationCheckedAt === "string"
      ? raw.populationCheckedAt
      : undefined;
  const missing = raw.population === null ? null : population;
  if (isPokeTracePopulationFresh(missing, checkedAt, dependencies.now?.())) {
    return false;
  }

  const apiKey = dependencies.apiKey ?? process.env.POKETRACE_API_KEY?.trim();
  if (!apiKey) return false;

  const fetchCard = dependencies.fetchCard ?? fetchPokeTraceCard;
  const live = await fetchCard(apiKey, id);
  const nextPopulation = parsePokeTracePsaPopulation(live.population) ?? null;
  const stampedAt = new Date(dependencies.now?.() ?? Date.now()).toISOString();
  await database.execute({
    sql: `
      UPDATE poketrace_cards
      SET raw_json = json_set(
        raw_json,
        '$.population', json(?),
        '$.populationCheckedAt', json(?)
      )
      WHERE id = ?
    `,
    args: [JSON.stringify(nextPopulation), JSON.stringify(stampedAt), id],
  });
  return true;
}
