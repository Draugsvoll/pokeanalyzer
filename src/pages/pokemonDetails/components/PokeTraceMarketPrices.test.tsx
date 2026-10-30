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
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  const prices = demoCard.pokeTrace.prices;
  expect(headlines).toHaveLength(2);
  expect(headlines[0]).toHaveTextContent(
    money.format(prices.tcgplayer.NEAR_MINT.avg),
  );
  expect(headlines[1]).toHaveTextContent(
    money.format(prices.ebay.NEAR_MINT.median7d ?? prices.ebay.NEAR_MINT.avg),
  );
  for (const change of changes) {
    expect(change).not.toHaveClass("app-price-change--unavailable");
    expect(change.textContent).toContain("%");
  }
  expect(changes[1]).toHaveTextContent("7.4%");
  expect(fetchCardPriceHistory).not.toHaveBeenCalled();
  expect(fetchMarketPriceHistory).not.toHaveBeenCalled();
});
