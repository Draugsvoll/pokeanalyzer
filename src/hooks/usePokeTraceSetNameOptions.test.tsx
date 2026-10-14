import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { usePokeTraceSetNameOptions } from "./usePokeTraceSetNameOptions";

const mocks = vi.hoisted(() => ({
  loadPokeTraceFilterOptions: vi.fn(),
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

test("updates the shared options when returning to the tab or window", async () => {
  const { result } = renderHook(() => usePokeTraceSetNameOptions());
  await waitFor(() => expect(result.current[0]?.setSummary).toEqual(summary));
  mocks.loadPokeTraceFilterOptions.mockResolvedValue({
    setNames: ["Test Set"],
    setSummaries: [{ ...summary, sevenDayChangePercent: 12 }],
  });
  const visibility = vi.spyOn(document, "visibilityState", "get");
  visibility.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(mocks.loadPokeTraceFilterOptions).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() =>
    expect(result.current[0]?.setSummary?.sevenDayChangePercent).toBe(12),
  );

  mocks.loadPokeTraceFilterOptions.mockResolvedValue({
    setNames: ["Test Set"],
    setSummaries: [{ ...summary, sevenDayChangePercent: -3 }],
  });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() =>
    expect(result.current[0]?.setSummary?.sevenDayChangePercent).toBe(-3),
  );
});

test("drops expired summaries on return even if the loader returns its stale fallback", async () => {
  const { result } = renderHook(() => usePokeTraceSetNameOptions());
  await waitFor(() => expect(result.current[0]?.setSummary).toEqual(summary));
  vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-05T01:00:01.000Z"));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(result.current[0]?.setSummary).toBeUndefined());
  expect(result.current[0]?.value).toBe("Test Set");
});

test("coalesces overlapping refresh events and removes listeners on unmount", async () => {
  const { result, unmount } = renderHook(() => usePokeTraceSetNameOptions());
  await waitFor(() => expect(result.current[0]?.setSummary).toEqual(summary));
  let resolveRefresh!: (value: null) => void;
  mocks.loadPokeTraceFilterOptions.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
  );
  act(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  expect(mocks.loadPokeTraceFilterOptions).toHaveBeenCalledTimes(2);
  const lastOptions = result.current;
  unmount();
  await act(async () => {
    resolveRefresh(null);
  });
  expect(result.current).toBe(lastOptions);
  act(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(mocks.loadPokeTraceFilterOptions).toHaveBeenCalledTimes(2);
});
