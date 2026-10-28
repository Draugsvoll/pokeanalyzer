import { render } from "@testing-library/react";
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
  const headlines = container.querySelectorAll(
    ".poketrace-market__price-summary > strong",
  );
  expect(headlines[0]).toHaveTextContent("$2,236.75");
  expect(headlines[1]).toHaveTextContent("$1,800.00");
  for (const change of changes) {
    expect(change).not.toHaveClass("app-price-change--unavailable");
    expect(change.textContent).toContain("%");
  }
  expect(fetchCardPriceHistory).not.toHaveBeenCalled();
  expect(fetchMarketPriceHistory).not.toHaveBeenCalled();
});
