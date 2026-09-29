import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PortfolioCard } from "../../types/portfolio";
import Portfolio from "./Portfolio";

const mocks = vi.hoisted(() => ({
  auth: {
    loading: false,
    user: null as null | { uid: string },
  },
  getHydratedPortfolio: vi.fn(),
  replacePortfolioReferences: vi.fn(),
}));

vi.mock("../../context/authContextValue", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("../../context/portfolioCacheContextValue", () => ({
  usePortfolioCache: () => ({
    replacePortfolioReferences: mocks.replacePortfolioReferences,
  }),
}));

vi.mock("../../services/portfolioApi", () => ({
  getHydratedPortfolio: mocks.getHydratedPortfolio,
}));

vi.mock("../../components/loginmodal/Loginmodal", () => ({
  default: () => null,
}));

vi.mock("../../components/pokemonCardView/PokemonCardView", () => ({
  PokemonCardPortfolioView: ({ card }: { card: PortfolioCard }) => (
    <div>Portfolio card: {card.name}</div>
  ),
}));

function collectionCard(): PortfolioCard {
  return {
    id: "base-4",
    image: "https://example.com/charizard.webp",
    name: "Charizard",
    quantity: 2,
    set: { id: "base", name: "Base Set" },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices: { tcgplayer: { NEAR_MINT: { avg: 100 } } },
    },
    priceSnapshots: {
      "7d": {
        marketPrice: 80,
        recordedAt: "2026-09-20T00:00:00.000Z",
        sourceUpdatedAt: null,
      },
    },
  };
}

function renderPortfolio() {
  return render(
    <MemoryRouter initialEntries={["/portfolio"]}>
      <Portfolio />
    </MemoryRouter>,
  );
}

describe("Portfolio", () => {
  beforeEach(() => {
    mocks.auth.loading = false;
    mocks.auth.user = null;
    mocks.getHydratedPortfolio.mockReset();
    mocks.replacePortfolioReferences.mockReset();
  });

  test("renders a public portfolio entry page when signed out", () => {
    renderPortfolio();

    expect(
      screen.getByRole("heading", {
        name: "Log in to view your collection",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: "Log in to view your collection",
      }),
    ).toHaveClass("default-container");
    expect(screen.getByRole("button", { name: "Log in" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
  });

  test("uses a neutral loading state while authentication resolves", () => {
    mocks.auth.loading = true;

    renderPortfolio();

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByRole("heading", { name: "My collection" })).toBeNull();
  });

  test("renders collection metrics and hydrated cards for a signed-in user", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      cards: [collectionCard()],
      entries: [{ cardId: "base-4", quantity: 2 }],
      missingCardIds: [],
    });

    renderPortfolio();

    expect((await screen.findAllByText("$200.00"))[0]).toBeVisible();
    const changeMetric = screen.getByText("7-day change").closest("article");
    expect(changeMetric).not.toBeNull();
    expect(changeMetric).toHaveTextContent("$40.00(25.0%)");
    expect(changeMetric).not.toHaveTextContent("+");
    expect(
      changeMetric!.querySelector(".app-price-change__arrow--up"),
    ).not.toBeNull();
    expect(screen.getByText("25.0%")).toBeVisible();
    expect(
      screen.getByText("2 of 2 cards have valid price data"),
    ).toBeVisible();
    expect(screen.getByText("Portfolio card: Charizard")).toBeVisible();
    expect(
      document.querySelector(".portfolio__metric--top-holding img"),
    ).toHaveAttribute("src", "https://example.com/charizard.webp");
    expect(screen.queryByText("Collection cards")).toBeNull();
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
    expect(mocks.replacePortfolioReferences).toHaveBeenCalledWith([
      { cardId: "base-4", quantity: 2 },
    ]);
  });

  test("uses a contained empty state without the collection header", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      cards: [],
      entries: [],
      missingCardIds: [],
    });

    renderPortfolio();

    const emptyHeading = await screen.findByRole("heading", {
      name: "Your collection is empty",
    });
    expect(emptyHeading.closest("section")).toHaveClass("default-container");
    expect(screen.queryByRole("heading", { name: "My collection" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add cards" })).toBeVisible();
  });

  test("offers recovery when collection loading fails", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockRejectedValue(
      new Error("Network unavailable"),
    );

    renderPortfolio();

    expect(
      await screen.findByRole("heading", {
        name: "We couldn't load your portfolio.",
      }),
    ).toBeVisible();
    expect(screen.getByText("Network unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();

    await waitFor(() =>
      expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1),
    );
  });

  test("cancels an active retry when the page unmounts", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockImplementationOnce(() => new Promise(() => undefined));

    const view = renderPortfolio();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(2),
    );
    const retrySignal = mocks.getHydratedPortfolio.mock.calls[1]?.[1] as
      AbortSignal | undefined;
    expect(retrySignal?.aborted).toBe(false);

    view.unmount();

    expect(retrySignal?.aborted).toBe(true);
  });
});
