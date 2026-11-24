import assert from "node:assert/strict";
import test from "node:test";
import {
  isPokeTracePopulationFresh,
  parsePokeTracePsaPopulation,
  POKE_TRACE_POPULATION_FRESH_MS,
  POKE_TRACE_POPULATION_MISSING_FRESH_MS,
} from "./pokeTracePopulation.js";

const population = {
  total: 10,
  gemRate: 0.1,
  updatedAt: "2026-11-18T00:00:00.000Z",
  grades: [{ grade: "10", count: 1, qualified: 0 }],
};

test("population freshness is one week when data exists and one month when missing", () => {
  const now = Date.parse("2026-11-24T00:00:00.000Z");
  assert.equal(isPokeTracePopulationFresh(population, undefined, now), false);
  assert.equal(
    isPokeTracePopulationFresh(
      population,
      new Date(now - POKE_TRACE_POPULATION_FRESH_MS + 1).toISOString(),
      now,
    ),
    true,
  );
  assert.equal(
    isPokeTracePopulationFresh(
      population,
      new Date(now - POKE_TRACE_POPULATION_FRESH_MS).toISOString(),
      now,
    ),
    false,
  );
  assert.equal(
    isPokeTracePopulationFresh(
      null,
      new Date(now - POKE_TRACE_POPULATION_MISSING_FRESH_MS + 1).toISOString(),
      now,
    ),
    true,
  );
  assert.equal(
    isPokeTracePopulationFresh(
      null,
      new Date(now - POKE_TRACE_POPULATION_MISSING_FRESH_MS).toISOString(),
      now,
    ),
    false,
  );
});

test("parsePokeTracePsaPopulation ignores invalid payloads", () => {
  assert.equal(parsePokeTracePsaPopulation(null), undefined);
  assert.deepEqual(parsePokeTracePsaPopulation(population), population);
});

test("parsePokeTracePsaPopulation keeps a non-zero authentic count", () => {
  assert.equal(
    parsePokeTracePsaPopulation({ ...population, authentic: 0 })?.authentic,
    undefined,
  );
  assert.equal(
    parsePokeTracePsaPopulation({ ...population, authentic: 12 })?.authentic,
    12,
  );
  assert.equal(
    parsePokeTracePsaPopulation({
      ...population,
      grades: [
        ...population.grades,
        { grade: "AUTH", count: 4, qualified: 0 },
      ],
    })?.authentic,
    4,
  );
});
