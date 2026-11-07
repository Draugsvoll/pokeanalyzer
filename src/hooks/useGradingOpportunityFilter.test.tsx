import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useGradingOpportunityFilter } from "./useGradingOpportunityFilter";
import { getGradingOpportunityList } from "../services/gradingOpportunityListApi";
import { GradingOpportunityFilter } from "../components/gradingOpportunitiesGrid/GradingOpportunityFilter";
import { GradingOpportunityBadge } from "../components/gradingOpportunitiesGrid/GradingOpportunityBadge";
import type { PokemonCard } from "../types/pokemon";
import {
  GRADING_LIST_BROWSER_TTL_MS,
  GRADING_LIST_MAX_AGE_MS,
} from "../../shared/gradingOpportunityList";

vi.mock("../services/gradingOpportunityListApi", () => ({
  getGradingOpportunityList: vi.fn(),
}));
const card = (id: string, price: number): PokemonCard => ({
  id,
  name: id,
  set: { id: "set", name: "Set" },
  pokeTrace: {
    currency: "USD",
    marketplaceUrls: {},
    prices: { tcgplayer: { NEAR_MINT: { avg: price } } },
  },
});
const cards = [
  card("qualified", 50),
  card("other-variant", 10),
  card("no-price", 0),
];

function Harness() {
  const grading = useGradingOpportunityFilter();
  return (
    <>
      {grading.available && (
        <GradingOpportunityFilter
          checked={grading.active}
          count={
            cards.filter((item) => grading.multiplier(item) !== null).length
          }
          onChange={grading.setEnabled}
        />
      )}
      {cards
        .filter((item) => !grading.active || grading.multiplier(item) !== null)
        .map((item) => (
          <div key={item.id} data-testid="card">
            {item.name}
            {grading.active && (
              <GradingOpportunityBadge multiplier={grading.multiplier(item)!} />
            )}
          </div>
        ))}
    </>
  );
}

beforeEach(() => {
  vi.mocked(getGradingOpportunityList).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

test("matches exact IDs, uses current TCG NM price for the badge, and restores normal cards when unchecked", async () => {
  vi.mocked(getGradingOpportunityList).mockResolvedValue({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    items: [
      { cardId: "qualified", psa10Price: 1000 },
      { cardId: "no-price", psa10Price: 1000 },
    ],
  });
  render(<Harness />);
  const checkbox = await screen.findByRole("checkbox", {
    name: "1 grading opportunity",
  });
  expect(checkbox).not.toBeChecked();
  expect(screen.getAllByTestId("card")).toHaveLength(3);
  fireEvent.click(checkbox);
  expect(screen.getAllByTestId("card")).toHaveLength(1);
  expect(
    screen.getByLabelText(
      "20 times TCGPlayer Near Mint price, based on eBay PSA 10 30-day median",
    ),
  ).toHaveTextContent("20");
  fireEvent.click(checkbox);
  expect(screen.getAllByTestId("card")).toHaveLength(3);
  expect(screen.queryByLabelText(/times TCGPlayer/)).toBeNull();
});

test("expires an active filter at 48h, hides its checkbox, and restores all cards", async () => {
  vi.useFakeTimers();
  const now = Date.now();
  vi.mocked(getGradingOpportunityList)
    .mockResolvedValueOnce({
      schemaVersion: 2,
      generatedAt: new Date(now - GRADING_LIST_MAX_AGE_MS + 1000).toISOString(),
      items: [{ cardId: "qualified", psa10Price: 1000 }],
    })
    .mockResolvedValue(null);
  await act(async () => {
    render(<Harness />);
  });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getAllByTestId("card")).toHaveLength(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getAllByTestId("card")).toHaveLength(3);
});

test("missing or failed lists quietly leave the normal grid usable", async () => {
  vi.mocked(getGradingOpportunityList).mockRejectedValue(new Error("offline"));
  await act(async () => {
    render(<Harness />);
  });
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getAllByTestId("card")).toHaveLength(3);
});

test("an open grid retries a no-list response after six hours", async () => {
  vi.useFakeTimers();
  vi.mocked(getGradingOpportunityList)
    .mockResolvedValueOnce(null)
    .mockResolvedValue({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      items: [{ cardId: "qualified", psa10Price: 1000 }],
    });
  await act(async () => {
    render(<Harness />);
  });
  expect(screen.queryByRole("checkbox")).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GRADING_LIST_BROWSER_TTL_MS - 1);
  });
  expect(getGradingOpportunityList).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(
    screen.getByRole("checkbox", { name: "1 grading opportunity" }),
  ).not.toBeChecked();
  expect(getGradingOpportunityList).toHaveBeenCalledTimes(2);
});
