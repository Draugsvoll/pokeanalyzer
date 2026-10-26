import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import demoCard from "../../../../public/demo-card.json";
import type { PokemonCard } from "../../../types/pokemon";
import {
  fetchCardPriceHistory,
  fetchMarketPriceHistory,
} from "../../../services/cardApi";
import { PokeTraceMarketPrices } from "./PokeTraceMarketPrices";

vi.mock("../../../services/cardApi", () => ({
  fetchCardPriceHistory: vi.fn(),
  fetchMarketPriceHistory: vi.fn(),
}));

test("renders both demo marketplace changes from embedded snapshots without fetching", () => {
  const { container } = render(
    <PokeTraceMarketPrices
      cardId="demo"
      data={demoCard.pokeTrace as PokemonCard["pokeTrace"]}
    />,
  );
  const changes = container.querySelectorAll(
    ".poketrace-market__price-summary .app-price-change",
  );
  expect(changes).toHaveLength(2);
  for (const change of changes) {
    expect(change).not.toHaveClass("app-price-change--unavailable");
    expect(change.textContent).toContain("%");
  }
  expect(fetchCardPriceHistory).not.toHaveBeenCalled();
  expect(fetchMarketPriceHistory).not.toHaveBeenCalled();
});

const priorityFields = [
  "median7d",
  "median30d",
  "median1d",
  "avg7d",
  "avg30d",
  "avg1d",
  "avg",
];

test.each(priorityFields)(
  "graded prices choose %s before lower-priority values",
  (field) => {
    const index = priorityFields.indexOf(field);
    const tier = Object.fromEntries(
      priorityFields.map((key, i) => [key, i < index ? null : 100 + i]),
    );
    const { container } = render(
      <PokeTraceMarketPrices
        cardId="demo"
        data={{
          ...(demoCard.pokeTrace as PokemonCard["pokeTrace"]),
          prices: {
            ebay: {
              PSA_10: {
                ...tier,
                median3d: 999,
                lastUpdated: "2026-10-16T00:00:00Z",
              },
            },
          },
        }}
      />,
    );
    const tile = container.querySelector(".poketrace-market__graded-price")!;
    expect(tile.querySelector(":scope > strong")).toHaveTextContent(
      `$${100 + index}.00`,
    );
    expect(tile).toHaveTextContent("Updated Oct 16, 2026");
    expect(tile.querySelector("dl")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show details" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(tile as HTMLElement).getByText("3-day median")).toBeVisible();
    expect(within(tile as HTMLElement).getByText("$999.00")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(tile.querySelector("dl")).toBeNull();
  },
);
