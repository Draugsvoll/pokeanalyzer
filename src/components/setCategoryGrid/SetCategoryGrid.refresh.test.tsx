import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SetCategoryGrid } from "./SetCategoryGrid";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a stalled focus refresh hides weekly rankings, keeps the directory, and permits retry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T08:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  localStorage.clear();
  const payload = () => {
    const generatedAt = new Date().toISOString();
    const setNames = Array.from(
      { length: 6 },
      (_, index) => `Test Set ${index + 1}`,
    );
    return {
      schemaVersion: 2,
      generatedAt,
      rarities: [],
      setNames,
      setSummaries: setNames.map((setName, index) => ({
        setName,
        asOf: generatedAt,
        currency: "USD",
        comparableCards: 10,
        pricedCards: 10,
        uniqueCards: 10,
        sevenDayChangePercent: index - 3,
      })),
    };
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => payload(),
    } as Response)
    .mockImplementationOnce(() => new Promise<Response>(() => undefined))
    .mockImplementationOnce(
      async () => ({ ok: true, json: async () => payload() }) as Response,
    );
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => {
    render(
      <MemoryRouter>
        <SetCategoryGrid />
      </MemoryRouter>,
    );
  });
  expect(
    screen.getByRole("heading", { name: "Gainers & Losers" }),
  ).toBeVisible();

  // The six-hour browser cache has expired.
  vi.setSystemTime(new Date("2026-10-13T14:00:00Z"));
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
  expect(
    screen.queryByRole("heading", { name: "Gainers & Losers" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Test Set 1" })).toBeVisible();

  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(
    screen.getByRole("heading", { name: "Gainers & Losers" }),
  ).toBeVisible();
});
