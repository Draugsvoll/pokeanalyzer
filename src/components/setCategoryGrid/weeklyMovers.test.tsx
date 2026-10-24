import { createPokeTraceSetSummaries } from "../../../shared/pokeTraceSetSummaries";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  usePokeTraceSetNameOptions,
  type PokeTraceSetNameOption,
} from "../../hooks/usePokeTraceSetNameOptions";
import { selectWeeklyMovers } from "./weeklyMovers";
import { SetCategoryGrid } from "./SetCategoryGrid";

vi.mock("../../hooks/usePokeTraceSetNameOptions", () => ({
  usePokeTraceSetNameOptions: vi.fn(),
}));

function options(): PokeTraceSetNameOption[] {
  return [
    "Base Set",
    "Jungle",
    "Fossil",
    "Base Set 2",
    "Team Rocket",
    "Gym Heroes",
    "Gym Challenge",
  ].map((name, index) => ({
    label: name,
    value: name,
    setSummary: {
      setName: name,
      asOf: new Date().toISOString(),
      currency: "USD",
      uniqueCards: 100,
      pricedCards: 90,
      comparableCards: 80,
      sevenDayChangePercent: index + 1,
    },
  }));
}

beforeEach(() => {
  vi.mocked(usePokeTraceSetNameOptions).mockReturnValue(options());
});

test("returns both rankings with consistent alphabetical ties without mutating input", () => {
  const input = options();
  input.forEach((option) => {
    option.setSummary!.sevenDayChangePercent = 0;
  });
  const originalNames = input.map(({ value }) => value);
  const expectedNames = [...originalNames]
    .sort((a, b) => a.localeCompare(b, "en-US"))
    .slice(0, 6);
  const rankings = selectWeeklyMovers(input)!;
  expect(rankings.gainers.map(({ value }) => value)).toEqual(expectedNames);
  expect(rankings.losers.map(({ value }) => value)).toEqual(expectedNames);
  expect(input.map(({ value }) => value)).toEqual(originalNames);
});

test("rejects duplicate sets but accepts valid older summaries", () => {
  const input = options();
  expect(selectWeeklyMovers([...input, input[0]])).toBeNull();
  input.forEach((option) => {
    option.setSummary!.asOf = "2000-01-01T00:00:00Z";
  });
  expect(selectWeeklyMovers(input)).not.toBeNull();
});

test("ranks the best six changes regardless of sign without changing the source list", () => {
  const input = options();
  expect(selectWeeklyMovers(input)!.gainers.map(({ value }) => value)).toEqual(
    input
      .slice(1)
      .reverse()
      .map(({ value }) => value),
  );
  expect(input[0].value).toBe("Base Set");
  input[0].setSummary!.sevenDayChangePercent = -10;
  expect(selectWeeklyMovers(input)!.gainers).toHaveLength(6);
  input[1].setSummary!.sevenDayChangePercent = 0;
  expect(
    selectWeeklyMovers(input)!.gainers.map(
      (option) => option.setSummary!.sevenDayChangePercent,
    ),
  ).toEqual([7, 6, 5, 4, 3, 0]);
  input.forEach((option, index) => {
    option.setSummary!.sevenDayChangePercent = index - 10;
  });
  expect(
    selectWeeklyMovers(input)!.gainers.map(
      (option) => option.setSummary!.sevenDayChangePercent,
    ),
  ).toEqual([-4, -5, -6, -7, -8, -9]);
  expect(selectWeeklyMovers(input.slice(0, 5))).toBeNull();
});

test.each(["missing", "null", "no-history"])(
  "still shows six gainers when another set has %s comparison history",
  (issue) => {
    const input = options();
    if (issue === "missing") delete input[0].setSummary;
    if (issue === "null") input[0].setSummary!.sevenDayChangePercent = null;
    if (issue === "no-history") input[0].setSummary!.comparableCards = 0;
    expect(
      selectWeeklyMovers(input)!.gainers.map(({ value }) => value),
    ).toEqual(
      input
        .slice(1)
        .reverse()
        .map(({ value }) => value),
    );
  },
);

test.each(["nan", "invalid date", "counts", "identity"])(
  "omits the entire ranking when one summary is %s",
  (issue) => {
    const input = options();
    const summary = input[0].setSummary!;
    if (issue === "nan") summary.sevenDayChangePercent = NaN;
    if (issue === "invalid date") summary.asOf = "invalid";
    if (issue === "counts") summary.comparableCards = 101;
    if (issue === "identity") summary.setName = "Wrong set";
    expect(selectWeeklyMovers(input)).toBeNull();
  },
);

test("hides/restores weekly gainers & losers as every directory control changes", () => {
  const title = "Gainers & Losers";
  render(
    <MemoryRouter>
      <SetCategoryGrid />
    </MemoryRouter>,
  );
  const heading = () => screen.queryByRole("heading", { name: title });
  const group = heading()!.closest("section")!;
  expect(group.parentElement?.children[0]).toBe(group);
  expect(within(group).getAllByRole("button")).toHaveLength(7);
  expect(within(group).getAllByRole("button")[0]).toHaveAccessibleName(
    "Open Gym Challenge",
  );
  expect(within(group).getAllByRole("button")[6]).toHaveAccessibleName(
    "Open Base Set",
  );

  const input = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.change(input, { target: { value: "Base" } });
  expect(heading()).toBeNull();
  fireEvent.change(input, { target: { value: "" } });
  expect(heading()).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Filter sets by era" }));
  fireEvent.click(screen.getByRole("option", { name: "Base" }));
  expect(heading()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Filter sets by era" }));
  fireEvent.click(screen.getByRole("option", { name: "All Eras" }));
  expect(heading()).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Sort set directory" }));
  fireEvent.click(screen.getByRole("option", { name: "Oldest" }));
  expect(heading()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sort set directory" }));
  fireEvent.click(screen.getByRole("option", { name: "Newest" }));
  expect(heading()).not.toBeNull();
});

test.each([
  [
    [1, 2, 3, 4, 5, 6, 7],
    [1, 2, 3, 4, 5, 6],
  ],
  [
    [-10, 0, 3, -2, 5, 6, 7],
    [-10, -2, 0, 3, 5, 6],
  ],
  [
    [-1, -2, -3, -4, -5, -6, -7],
    [-7, -6, -5, -4, -3, -2],
  ],
])("ranks weekly losers from lowest to highest for %j", (changes, expected) => {
  const input = options();
  input.forEach((option, index) => {
    option.setSummary!.sevenDayChangePercent = changes[index];
  });
  expect(
    selectWeeklyMovers(input)!.losers.map(
      (option) => option.setSummary!.sevenDayChangePercent,
    ),
  ).toEqual(expected);
});

test("unavailable summaries leave the regular directory visible without a gainers heading", () => {
  vi.mocked(usePokeTraceSetNameOptions).mockReturnValue(
    options().map(({ label, value }) => ({ label, value })),
  );
  render(
    <MemoryRouter>
      <SetCategoryGrid />
    </MemoryRouter>,
  );
  expect(
    screen.queryByRole("heading", { name: "Gainers & Losers" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Open Base Set" })).toBeVisible();
});

test("filters sets worth less than $2 before filling both rankings", () => {
  const input = options();
  input[0].setSummary = createPokeTraceSetSummaries(
    [
      {
        id: "cheap",
        name: "cheap",
        setName: input[0].value,
        currency: "USD",
        conditionPrices: { NEAR_MINT: 1.99 },
        priceSnapshots: { "1d": null, "7d": 0.01, "30d": null },
      },
    ],
    new Date().toISOString(),
  )[0];
  const rankings = selectWeeklyMovers(input)!;
  for (const ranking of [rankings.gainers, rankings.losers]) {
    expect(ranking).toHaveLength(6);
    expect(ranking.map(({ value }) => value)).not.toContain(input[0].value);
  }
});
