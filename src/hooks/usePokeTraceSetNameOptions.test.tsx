import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { usePokeTraceSetNameOptions } from "./usePokeTraceSetNameOptions";

const mocks = vi.hoisted(() => ({
  loadPokeTraceCatalogSetNames: vi.fn(),
  loadPokeTraceFilterOptions: vi.fn(),
}));

vi.mock("../services/pokeTraceCatalog", () => ({
  loadPokeTraceCatalogSetNames: mocks.loadPokeTraceCatalogSetNames,
}));

vi.mock("../services/pokeTraceFilterOptions", () => ({
  loadPokeTraceFilterOptions: mocks.loadPokeTraceFilterOptions,
}));

const generatedAt = "2026-10-03T01:00:00.000Z";
const summary = {
  asOf: generatedAt,
  comparableCards: 10,
  currency: "USD",
  pricedCards: 11,
  setName: "Test Set",
  sevenDayChangePercent: 5,
  uniqueCards: 12,
};

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-03T02:00:00.000Z"));
  mocks.loadPokeTraceCatalogSetNames.mockReset();
  mocks.loadPokeTraceCatalogSetNames.mockResolvedValue(["Test Set"]);
  mocks.loadPokeTraceFilterOptions.mockReset();
  mocks.loadPokeTraceFilterOptions.mockResolvedValue({
    schemaVersion: 2,
    generatedAt,
    rarities: [],
    setNames: ["Test Set"],
    setSummaries: [summary],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("adds a fresh optional market summary to a set option", async () => {
  const { result } = renderHook(() => usePokeTraceSetNameOptions());

  await waitFor(() => expect(result.current[0]?.value).toBe("Test Set"));
  expect(result.current[0]?.setSummary).toEqual(summary);
});

test("keeps the set option but omits an expired market summary", async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-05T01:00:01.000Z"));
  const { result } = renderHook(() => usePokeTraceSetNameOptions());

  await waitFor(() => expect(result.current[0]?.value).toBe("Test Set"));
  expect(result.current[0]?.setSummary).toBeUndefined();
});
