import { expect, test } from "vitest";
import {
  parsePokeTraceFilterOptions,
  POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION,
} from "../../shared/pokeTraceFilterOptions";

test("upgrades a legacy set list without requiring market summaries", () => {
  expect(
    parsePokeTraceFilterOptions({
      schemaVersion: 1,
      generatedAt: "2026-10-03T01:00:00.000Z",
      rarities: ["Rare"],
      setNames: ["Base Set"],
    }),
  ).toEqual({
    schemaVersion: POKETRACE_FILTER_OPTIONS_SCHEMA_VERSION,
    generatedAt: "2026-10-03T01:00:00.000Z",
    rarities: ["Rare"],
    setNames: ["Base Set"],
    setSummaries: [],
  });
});
