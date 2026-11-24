import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import type { PokeTraceCard } from "./pokeTraceApi.js";
import { refreshStoredPokeTracePopulation } from "./pokeTracePopulationRefresh.js";
import {
  POKE_TRACE_POPULATION_FRESH_MS,
  POKE_TRACE_POPULATION_MISSING_FRESH_MS,
} from "../../shared/pokeTracePopulation.js";

const now = Date.parse("2026-11-24T12:00:00.000Z");
const stampedAt = new Date(now).toISOString();

const population = {
  total: 10,
  gemRate: 0.1,
  updatedAt: "2026-11-18T00:00:00.000Z",
  grades: [{ grade: "10", count: 1, qualified: 0 }],
};

async function createDatabase(
  id: string,
  raw: Record<string, unknown> | null = { name: "Charizard" },
) {
  const database = createClient({ url: "file::memory:" });
  await database.execute(`
    CREATE TABLE poketrace_cards (
      id TEXT PRIMARY KEY,
      raw_json TEXT NOT NULL
    )
  `);
  if (raw) {
    await database.execute({
      sql: "INSERT INTO poketrace_cards (id, raw_json) VALUES (?, ?)",
      args: [id, JSON.stringify(raw)],
    });
  }
  return database;
}

async function readCardJson(
  database: Awaited<ReturnType<typeof createDatabase>>,
  id: string,
) {
  const result = await database.execute({
    sql: "SELECT raw_json FROM poketrace_cards WHERE id = ?",
    args: [id],
  });
  return JSON.parse(String(result.rows[0]?.raw_json));
}

function liveCard(
  id: string,
  nextPopulation?: PokeTraceCard["population"],
): PokeTraceCard {
  return {
    id,
    name: "Charizard",
    game: "pokemon",
    market: "US",
    productType: "single",
    ...(nextPopulation ? { population: nextPopulation } : {}),
  };
}

function noFetch(): never {
  throw new Error("PokeTrace must not be called");
}

test("a fresh stored population skips the PokeTrace fetch", async () => {
  const id = "fresh-pop";
  const database = await createDatabase(id, {
    name: "Charizard",
    population,
    populationCheckedAt: new Date(
      now - POKE_TRACE_POPULATION_FRESH_MS + 1,
    ).toISOString(),
  });
  try {
    assert.equal(
      await refreshStoredPokeTracePopulation(id, {
        database,
        ready: Promise.resolve(),
        apiKey: "test-key",
        now: () => now,
        fetchCard: noFetch,
      }),
      false,
    );
    const stored = await readCardJson(database, id);
    assert.deepEqual(stored.population, population);
  } finally {
    database.close();
  }
});

test("a fresh stored miss skips the PokeTrace fetch", async () => {
  const id = "fresh-miss";
  const checkedAt = new Date(
    now - POKE_TRACE_POPULATION_MISSING_FRESH_MS + 1,
  ).toISOString();
  const database = await createDatabase(id, {
    name: "Charizard",
    population: null,
    populationCheckedAt: checkedAt,
  });
  try {
    assert.equal(
      await refreshStoredPokeTracePopulation(id, {
        database,
        ready: Promise.resolve(),
        apiKey: "test-key",
        now: () => now,
        fetchCard: noFetch,
      }),
      false,
    );
    const stored = await readCardJson(database, id);
    assert.equal(stored.population, null);
    assert.equal(stored.populationCheckedAt, checkedAt);
  } finally {
    database.close();
  }
});

test("a missing API key leaves stored population unchanged", async () => {
  const id = "missing-key";
  const database = await createDatabase(id, { name: "Charizard" });
  try {
    assert.equal(
      await refreshStoredPokeTracePopulation(id, {
        database,
        ready: Promise.resolve(),
        apiKey: "",
        now: () => now,
        fetchCard: noFetch,
      }),
      false,
    );
    const stored = await readCardJson(database, id);
    assert.equal(stored.population, undefined);
    assert.equal(stored.populationCheckedAt, undefined);
  } finally {
    database.close();
  }
});

test("a thrown PokeTrace fetch does not stamp population", async () => {
  const id = "fetch-throw";
  const database = await createDatabase(id, {
    name: "Charizard",
    population,
  });
  try {
    await assert.rejects(
      () =>
        refreshStoredPokeTracePopulation(id, {
          database,
          ready: Promise.resolve(),
          apiKey: "test-key",
          now: () => now,
          fetchCard: async () => {
            throw new Error("PokeTrace unavailable");
          },
        }),
      /PokeTrace unavailable/,
    );
    const stored = await readCardJson(database, id);
    assert.deepEqual(stored.population, population);
    assert.equal(stored.populationCheckedAt, undefined);
  } finally {
    database.close();
  }
});

test("a successful omit writes JSON null and a checked stamp", async () => {
  const id = "successful-omit";
  const database = await createDatabase(id, {
    name: "Charizard",
    population,
  });
  try {
    assert.equal(
      await refreshStoredPokeTracePopulation(id, {
        database,
        ready: Promise.resolve(),
        apiKey: "test-key",
        now: () => now,
        fetchCard: async () => liveCard(id),
      }),
      true,
    );
    const stored = await readCardJson(database, id);
    assert.equal(stored.population, null);
    assert.equal(stored.populationCheckedAt, stampedAt);
  } finally {
    database.close();
  }
});

test("a successful fetch writes the parsed population and a checked stamp", async () => {
  const id = "successful-pop";
  const database = await createDatabase(id, { name: "Charizard" });
  try {
    assert.equal(
      await refreshStoredPokeTracePopulation(id, {
        database,
        ready: Promise.resolve(),
        apiKey: "test-key",
        now: () => now,
        fetchCard: async () => liveCard(id, population),
      }),
      true,
    );
    const stored = await readCardJson(database, id);
    assert.deepEqual(stored.population, population);
    assert.equal(stored.populationCheckedAt, stampedAt);
  } finally {
    database.close();
  }
});

test("concurrent refreshes for the same card share one in-flight fetch", async () => {
  const id = "inflight";
  const database = await createDatabase(id, { name: "Charizard" });
  let requests = 0;
  let releaseFetch!: () => void;
  let markFetchStarted!: () => void;
  const fetchStarted = new Promise<void>((resolve) => {
    markFetchStarted = resolve;
  });
  const fetchReleased = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  const dependencies = {
    database,
    ready: Promise.resolve(),
    apiKey: "test-key",
    now: () => now,
    fetchCard: async () => {
      requests += 1;
      markFetchStarted();
      await fetchReleased;
      return liveCard(id, population);
    },
  };

  try {
    const first = refreshStoredPokeTracePopulation(id, dependencies);
    await fetchStarted;
    const second = refreshStoredPokeTracePopulation(id, dependencies);
    releaseFetch();
    const [firstUpdated, secondUpdated] = await Promise.all([first, second]);
    assert.equal(requests, 1);
    assert.equal(firstUpdated, true);
    assert.equal(secondUpdated, true);
    const stored = await readCardJson(database, id);
    assert.deepEqual(stored.population, population);
    assert.equal(stored.populationCheckedAt, stampedAt);
  } finally {
    database.close();
  }
});
