import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { PokemonCardView } from "./PokemonCardView";

vi.mock("../../context/authContextValue", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("../../context/portfolioCacheContextValue", () => ({
  usePortfolioCache: () => ({
    isCardSaved: () => false,
    loadingPortfolioReferences: false,
    portfolioReferencesError: null,
  }),
}));

vi.mock("../../hooks/pokemonPortfolio", () => ({
  usePokemonPortfolio: () => ({
    removePokemonFromPortfolio: vi.fn(),
    savePokemonToPortfolio: vi.fn(),
  }),
}));

function card(): PokemonCard {
  return {
    id: "card-1",
    image: "",
    name: "Pikachu",
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      marketPriceSnapshots: { "7d": 100 },
      prices: { tcgplayer: { NEAR_MINT: { avg: 110 } } },
    },
    set: { id: "base-set", name: "Base Set" },
  };
}

function renderCard(
  props: Partial<ComponentProps<typeof PokemonCardView>> = {},
) {
  return render(
    <MemoryRouter>
      <PokemonCardView card={card()} {...props} />
    </MemoryRouter>,
  );
}

describe("PokemonCardView default price change", () => {
  test("shows the seven-day change for the default TCGPlayer Near Mint price", () => {
    renderCard();

    expect(screen.getByText("10.0%")).toHaveAttribute(
      "title",
      "7-day TCGPlayer Near Mint change",
    );
    expect(screen.getByText("7d")).toHaveClass("app-price-change__period");
  });

  test("shows the default change for an explicit Near Mint display", () => {
    renderCard({
      marketDisplay: {
        condition: "NEAR_MINT",
        currency: "USD",
        price: 110,
        source: "tcgplayer",
      },
    });

    expect(screen.getByText("10.0%")).toBeInTheDocument();
  });

  test("does not apply the Near Mint snapshot to another condition", () => {
    const { container } = renderCard({
      marketDisplay: {
        condition: "LIGHTLY_PLAYED",
        currency: "USD",
        price: 90,
        source: "tcgplayer",
      },
    });

    expect(container.querySelector(".app-price-change")).toBeNull();
  });

  test("does not apply the TCGPlayer snapshot to another source", () => {
    const { container } = renderCard({
      marketDisplay: {
        condition: "NEAR_MINT",
        currency: "USD",
        price: 90,
        source: "ebay",
      },
    });

    expect(container.querySelector(".app-price-change")).toBeNull();
  });

  test("does not show a change without a current Near Mint price", () => {
    const withoutCurrentPrice = card();
    withoutCurrentPrice.pokeTrace.prices = {};
    const { container } = render(
      <MemoryRouter>
        <PokemonCardView card={withoutCurrentPrice} />
      </MemoryRouter>,
    );

    expect(container.querySelector(".app-price-change")).toBeNull();
  });

  test("keeps an explicitly supplied category change", () => {
    renderCard({
      marketDisplay: {
        changePercent: 25,
        condition: "NEAR_MINT",
        currency: "USD",
        price: 110,
        source: "tcgplayer",
      },
    });

    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.queryByText("10.0%")).not.toBeInTheDocument();
  });

  test("respects an explicitly unavailable portfolio comparison", () => {
    const { container } = renderCard({ comparisonPriceSnapshot: null });

    expect(container.querySelector(".app-price-change")).toBeNull();
  });

  test("renders the selected portfolio comparison period", () => {
    renderCard({
      comparisonPeriod: "30d",
      comparisonPriceSnapshot: {
        marketPrice: 90,
        recordedAt: "2026-08-29T00:00:00.000Z",
        sourceUpdatedAt: null,
      },
    });

    expect(screen.getByText("30d")).toHaveClass("app-price-change__period");
    expect(screen.getByText("22.2%")).toHaveAttribute(
      "title",
      "30-day change since 29 Aug 2026",
    );
  });
});
