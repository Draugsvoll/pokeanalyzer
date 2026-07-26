import assert from "node:assert/strict";
import test from "node:test";
import { validatePokemonTcgApiResponse } from "./pokemonTcgApi.js";

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
