import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePokemonTcgApiResponse,
  validatePokemonTcgApiSetResponse,
  validatePokemonTcgPaginatedResponse,
} from "./pokemonTcgApi.js";

test("Pokémon TCG API pagination metadata is validated strictly", () => {
  const valid = {
    count: 1,
    data: [{ id: "base1-1", name: "Alakazam" }],
    page: 1,
    pageSize: 250,
    totalCount: 1,
  };

  assert.equal(validatePokemonTcgApiResponse(valid, 1), valid);
  assert.throws(
    () => validatePokemonTcgApiResponse({ ...valid, count: 0 }, 1),
    /inconsistent pagination metadata/,
  );
  assert.throws(
    () => validatePokemonTcgApiResponse({ ...valid, page: 2 }, 1),
    /inconsistent pagination metadata/,
  );
  assert.throws(
    () => validatePokemonTcgApiResponse({ ...valid, totalCount: -1 }, 1),
    /inconsistent pagination metadata/,
  );
});

test("set discovery validates pagination and every set identity", () => {
  const valid = {
    count: 2,
    data: [
      { id: "base1", name: "Base" },
      { id: "jungle", name: "Jungle" },
    ],
    page: 1,
    pageSize: 250,
    totalCount: 2,
  };
  assert.deepEqual(validatePokemonTcgApiSetResponse(valid, 1), valid);
  assert.throws(
    () =>
      validatePokemonTcgApiSetResponse(
        {
          ...valid,
          data: [{ id: "", name: "Broken" }, valid.data[1]],
        },
        1,
      ),
    /incomplete set/,
  );
});

test("generic API validation supports the one-card global count request", () => {
  const valid = {
    count: 1,
    data: [{ id: "base1-1" }],
    page: 1,
    pageSize: 1,
    totalCount: 20_000,
  };
  assert.deepEqual(
    validatePokemonTcgPaginatedResponse(
      valid,
      1,
      1,
      "Global card-count request",
    ),
    valid,
  );
});
