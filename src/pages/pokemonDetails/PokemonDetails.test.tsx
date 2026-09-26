import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import type { GrokRequestState } from "../../utils/grok/grokClient";
import PokemonDetails from "./PokemonDetails";

const mocks = vi.hoisted(() => ({
  authLoading: false,
  authUser: { uid: "user-1" } as { uid: string } | null,
  askGrok: vi.fn(),
  creditsRemaining: 10,
  ebayRuns: vi.fn(),
  fetchCardById: vi.fn(),
  fetchMarketPriceHistory: vi.fn(),
  hasSubscription: true,
  loadingSubscription: false,
  updateSubscription: vi.fn(),
}));

const subscription = {
  bonusCreditsRemaining: 0,
  bonusCreditsTotal: 0,
  bonusCreditsUsed: 0,
  cancelAtPeriodEnd: false,
  membershipCreditsRemaining: 10,
  membershipCreditsTotal: 10,
  membershipCreditsUsed: 0,
  planId: "free" as const,
  planName: "Free",
  status: "active" as const,
};

function buildCard(id: string, name: string): PokemonCard {
  return {
    id,
    image: `${id}.png`,
    name,
    number: "58/102",
    rarity: "Common",
    set: {
      id: "base1",
      name: "Base Set",
    },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices: {},
      variant: "Normal",
      variants: [{ id, name: "Normal" }],
    },
  };
}

vi.mock("../../utils/grok/grokClient", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../utils/grok/grokClient")>();
  return {
    ...original,
    askGrok: mocks.askGrok,
  };
});

vi.mock("../../services/cardApi", () => ({
  fetchCardById: mocks.fetchCardById,
  fetchMarketPriceHistory: mocks.fetchMarketPriceHistory,
}));

vi.mock("../../context/authContextValue", () => ({
  useAuth: () => ({
    loading: mocks.authLoading,
    logout: vi.fn(),
    user: mocks.authUser,
  }),
}));

vi.mock("../../subscriptions", () => ({
  useCredits: () => ({
    creditMessage: null,
    creditsRemaining: mocks.creditsRemaining,
    updatingCredits: false,
  }),
  useMembershipSubscription: () => ({
    loadingSubscription: mocks.loadingSubscription,
    subscription: mocks.hasSubscription ? subscription : null,
    updateSubscription: mocks.updateSubscription,
  }),
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

vi.mock("../../components/loginmodal/Loginmodal", () => ({
  default: () => null,
}));

vi.mock("./components/CardFeatureHeader", () => ({
  CARD_FEATURE_HEADER_ACTION_LABEL: "Open",
  CARD_FEATURE_VARIANTS_ID: "card-feature-variants",
  CardFeatureHeader: ({
    actionDisabled,
    actionHidden,
    actionLoading,
    label,
    onAction,
  }: {
    actionDisabled?: boolean;
    actionHidden?: boolean;
    actionLoading?: boolean;
    label: string;
    onAction?: () => void;
  }) => (
    <header>
      <span>{label}</span>
      {onAction && !actionHidden && (
        <button
          data-testid="feature-action"
          type="button"
          disabled={actionDisabled || actionLoading}
          aria-busy={actionLoading}
          onClick={onAction}
        >
          {actionLoading ? `Loading ${label}` : `Open ${label}`}
        </button>
      )}
    </header>
  ),
}));

function ResponseView({
  emptyLabel,
  grokRequest,
  testId,
}: {
  emptyLabel: string;
  grokRequest: GrokRequestState;
  testId: string;
}) {
  return <div data-testid={testId}>{grokRequest.response || emptyLabel}</div>;
}

vi.mock("./views/CollectorAnalysis/CollectorAnalysisView", () => ({
  default: ({ grokRequest }: { grokRequest: GrokRequestState }) => (
    <ResponseView
      emptyLabel="No collector response"
      grokRequest={grokRequest}
      testId="collector-response"
    />
  ),
}));

vi.mock("./views/WorthGrading/WorthGradingView", () => ({
  WorthGradingView: ({ grokRequest }: { grokRequest: GrokRequestState }) => (
    <ResponseView
      emptyLabel="No grading response"
      grokRequest={grokRequest}
      testId="grading-response"
    />
  ),
}));

vi.mock("./views/MarketAnalysis/MarketAnalysisView", () => ({
  MarketAnalysisView: ({ grokRequest }: { grokRequest: GrokRequestState }) => (
    <div>
      <span data-testid="market-price-response">
        {grokRequest.response || "No market price response"}
      </span>
    </div>
  ),
}));

vi.mock("./views/EbaySold/EbaySoldView", async () => {
  const { useEffect, useState } = await import("react");

  function MockEbaySoldView({
    onLoadingChange,
    onReportAvailableChange,
    runToken,
  }: {
    onLoadingChange: (loading: boolean) => void;
    onReportAvailableChange: (available: boolean) => void;
    runToken: number;
  }) {
    const [response, setResponse] = useState("");

    useEffect(() => {
      if (!runToken) return;

      mocks.ebayRuns(runToken);
      onLoadingChange(false);
      onReportAvailableChange(true);
      setResponse(`eBay response ${runToken}`);
    }, [onLoadingChange, onReportAvailableChange, runToken]);

    return (
      <div data-testid="ebay-response">{response || "No eBay response"}</div>
    );
  }

  return { default: MockEbaySoldView };
});

function TestRoutes() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate("/card/card-b")}>
        Open next card
      </button>
      <Routes>
        <Route path="/card/:id" element={<PokemonDetails />} />
        <Route path="/profile" element={<span>Profile page</span>} />
      </Routes>
    </>
  );
}

beforeEach(() => {
  mocks.authLoading = false;
  mocks.authUser = { uid: "user-1" };
  mocks.creditsRemaining = 10;
  mocks.askGrok.mockReset();
  mocks.ebayRuns.mockReset();
  mocks.fetchCardById.mockReset();
  mocks.fetchMarketPriceHistory.mockReset();
  mocks.hasSubscription = true;
  mocks.loadingSubscription = false;
  mocks.updateSubscription.mockReset();

  mocks.fetchCardById.mockImplementation(async (cardId: string) =>
    cardId === "card-a"
      ? buildCard("card-a", "Pikachu")
      : buildCard("card-b", "Raichu"),
  );
  mocks.fetchMarketPriceHistory.mockImplementation(async (cardId: string) => ({
    cardId,
    condition: "NEAR_MINT",
    currency: "USD",
    fetchedAt: "2026-09-19T10:00:00.000Z",
    period: "90d",
    series: {},
    stale: false,
  }));
  mocks.askGrok.mockImplementation(async (feature: string) => ({
    fromDatabase: false,
    ok: true,
    subscription,
    text: `${feature} response`,
  }));
});

test("keeps the embedded card search open while using its controls", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  fireEvent.click(screen.getByRole("button", { name: "Next Card" }));

  const dialog = await screen.findByRole("dialog", { name: "Switch card" });
  const filtersButton = screen.getByRole("button", {
    name: "Search filters",
  });
  fireEvent.mouseDown(filtersButton);
  fireEvent.click(filtersButton);

  const minimumPrice = screen.getByRole("spinbutton", {
    name: "Minimum price",
  });
  fireEvent.change(minimumPrice, { target: { value: "25" } });
  const clearFilters = screen.getByRole("button", { name: "Clear all" });
  fireEvent.mouseDown(clearFilters);
  fireEvent.click(clearFilters);

  expect(minimumPrice).toHaveValue(null);
  expect(dialog).toBeInTheDocument();
});

test("closes the embedded card search with its visible close button", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  const trigger = screen.getByRole("button", { name: "Next Card" });
  trigger.focus();
  fireEvent.click(trigger);

  expect(
    await screen.findByRole("dialog", { name: "Switch card" }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close card search" }));

  expect(
    screen.queryByRole("dialog", { name: "Switch card" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next Card" })).toHaveFocus();
});

test("contains focus and lets autocomplete dismiss itself before the dialog", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  fireEvent.click(screen.getByRole("button", { name: "Next Card" }));

  const dialog = await screen.findByRole("dialog", { name: "Switch card" });
  const closeButton = screen.getByRole("button", {
    name: "Close card search",
  });
  const filtersButton = screen.getByRole("button", { name: "Search filters" });

  filtersButton.focus();
  fireEvent.keyDown(filtersButton, { key: "Tab" });
  expect(closeButton).toHaveFocus();

  fireEvent.click(filtersButton);
  const rarityInput = screen.getByRole("combobox", {
    name: "Filter by rarity",
  });
  fireEvent.focus(rarityInput);
  expect(
    screen.getByRole("listbox", { name: "Rarity suggestions" }),
  ).toBeInTheDocument();

  fireEvent.keyDown(rarityInput, { key: "Escape" });
  expect(dialog).toBeInTheDocument();
  expect(
    screen.queryByRole("listbox", { name: "Rarity suggestions" }),
  ).not.toBeInTheDocument();

  fireEvent.keyDown(rarityInput, { key: "Escape" });
  expect(
    screen.queryByRole("dialog", { name: "Switch card" }),
  ).not.toBeInTheDocument();
});

test("enables feature actions after authentication and subscription loading", async () => {
  mocks.authLoading = true;
  mocks.authUser = null;
  mocks.hasSubscription = false;
  mocks.loadingSubscription = true;

  const renderView = () => (
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>
  );
  const { rerender } = render(renderView());

  await screen.findByRole("heading", { name: "Pikachu" });
  let actionButton = screen.getByRole("button", {
    name: "Loading eBay Comps",
  });

  expect(actionButton).toBeDisabled();
  expect(actionButton).toHaveAttribute("aria-busy", "true");

  mocks.authLoading = false;
  mocks.authUser = { uid: "user-1" };
  rerender(renderView());

  actionButton = screen.getByRole("button", {
    name: "Loading eBay Comps",
  });
  expect(actionButton).toBeDisabled();

  mocks.hasSubscription = true;
  mocks.loadingSubscription = false;
  rerender(renderView());

  actionButton = screen.getByRole("button", {
    name: "Open eBay Comps",
  });
  expect(actionButton).toBeEnabled();
  expect(actionButton).toHaveAttribute("aria-busy", "false");
});

test("sends a user with no credits to the profile page", async () => {
  mocks.creditsRemaining = 0;

  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  const action = await screen.findByTestId("feature-action");
  expect(action).toBeEnabled();

  fireEvent.click(action);

  expect(await screen.findByText("Profile page")).toBeVisible();
});

test("shows market loading while fetching a variant and reuses the result", async () => {
  const cardA = buildCard("card-a", "Pikachu");
  cardA.pokeTrace.prices = { tcgplayer: { NEAR_MINT: { avg: 10 } } };
  cardA.pokeTrace.variants = [
    { id: "card-a", name: "Normal" },
    { id: "card-b", name: "Holofoil" },
  ];
  const cardB = buildCard("card-b", "Raichu");
  cardB.pokeTrace.prices = { tcgplayer: { NEAR_MINT: { avg: 20 } } };
  cardB.pokeTrace.variant = "Holofoil";
  cardB.pokeTrace.variants = cardA.pokeTrace.variants;
  let resolveCardB!: (card: PokemonCard) => void;
  const cardBRequest = new Promise<PokemonCard>((resolve) => {
    resolveCardB = resolve;
  });
  mocks.fetchCardById.mockImplementation((cardId: string) =>
    cardId === "card-a" ? Promise.resolve(cardA) : cardBRequest,
  );

  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  fireEvent.click(screen.getByRole("radio", { name: "Holofoil" }));
  expect(screen.getByRole("heading", { name: "Pikachu" })).toBeInTheDocument();
  const variantLoading = screen.getByRole("status", {
    name: "Loading market data",
  });
  expect(variantLoading).toBeInTheDocument();
  expect(variantLoading.closest(".poketrace-market")).not.toBeNull();
  expect(
    screen.queryByRole("status", { name: "Loading eBay prices" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Loading Pok/)).not.toBeInTheDocument();

  resolveCardB(cardB);
  await screen.findByRole("heading", { name: "Raichu" });

  expect(
    mocks.fetchCardById.mock.calls.filter(([cardId]) => cardId === "card-b"),
  ).toHaveLength(1);
});

test("keeps navigation details visible while the complete card loads", async () => {
  const navigationCard = buildCard("card-a", "Cached Pikachu");
  navigationCard.pokeTrace.prices = {
    tcgplayer: { NEAR_MINT: { avg: 10 } },
  };
  const completeCard = buildCard("card-a", "Complete Pikachu");
  let resolveRequest!: (card: PokemonCard) => void;
  mocks.fetchCardById.mockReturnValue(
    new Promise<PokemonCard>((resolve) => {
      resolveRequest = resolve;
    }),
  );

  render(
    <MemoryRouter
      initialEntries={[
        { pathname: "/card/card-a", state: { card: navigationCard } },
      ]}
    >
      <TestRoutes />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole("heading", { name: "Cached Pikachu" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "Loading complete card details" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("status", { name: "Loading market data" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("$10.00")).toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "Loading eBay prices" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "Loading graded prices" }),
  ).toBeInTheDocument();
  expect(screen.queryAllByText("No price data")).toHaveLength(0);
  expect(screen.queryByText("No graded prices")).not.toBeInTheDocument();
  expect(screen.queryByText(/Loading Pok/)).not.toBeInTheDocument();

  resolveRequest(completeCard);
  await screen.findByRole("heading", { name: "Complete Pikachu" });
  expect(
    screen.queryByRole("status", { name: "Loading complete card details" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("status", { name: "Loading market data" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByText("No price data")).toHaveLength(2);
  expect(screen.getByText("No graded prices")).toBeInTheDocument();
});

test("keeps navigation data and offers retry when complete card loading fails", async () => {
  const navigationCard = buildCard("card-a", "Cached Pikachu");
  navigationCard.pokeTrace.prices = {
    tcgplayer: { NEAR_MINT: { avg: 10 } },
  };
  const completeCard = buildCard("card-a", "Complete Pikachu");
  mocks.fetchCardById
    .mockRejectedValueOnce(new Error("Temporary failure"))
    .mockResolvedValueOnce(completeCard);

  render(
    <MemoryRouter
      initialEntries={[
        { pathname: "/card/card-a", state: { card: navigationCard } },
      ]}
    >
      <TestRoutes />
    </MemoryRouter>,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't refresh complete card data.",
  );
  expect(screen.getByText("$10.00")).toBeInTheDocument();
  expect(screen.queryAllByText("No price data")).toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  await screen.findByRole("heading", { name: "Complete Pikachu" });
  expect(mocks.fetchCardById).toHaveBeenCalledTimes(2);
});

test("Market Analysis fetches the stored market report", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  fireEvent.click(screen.getByRole("button", { name: /Market Analysis/ }));
  fireEvent.click(screen.getByRole("button", { name: "Open Market Analysis" }));

  await waitFor(() => {
    expect(screen.getByTestId("market-price-response")).toHaveTextContent(
      "market_analysis response",
    );
  });
  expect(mocks.askGrok).toHaveBeenCalledWith(
    "market_analysis",
    expect.objectContaining({
      cardId: "card-a",
      cardName: "Pikachu",
      cardNumber: "58/102",
      setName: "Base Set",
    }),
  );
  expect(mocks.askGrok.mock.calls[0]?.[1]).not.toHaveProperty("variantName");
});

test("Worth Grading sends the normalized active variant", async () => {
  const activeCard = buildCard("card-a", "Pikachu");
  activeCard.pokeTrace.variant = "  1st_Edition  ";
  activeCard.pokeTrace.variants = [
    { id: "card-a", name: "1st Edition" },
    { id: "card-b", name: "Unlimited" },
  ];
  mocks.fetchCardById.mockResolvedValue(activeCard);

  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  fireEvent.click(screen.getByRole("button", { name: /Grading/ }));
  const openGradingButton = screen.getByRole("button", {
    name: "Open Grading",
  });
  await waitFor(() => expect(openGradingButton).toBeEnabled(), {
    timeout: 2_000,
  });
  fireEvent.click(openGradingButton);

  await waitFor(() => {
    expect(mocks.askGrok).toHaveBeenCalledWith(
      "worth_grading",
      expect.objectContaining({
        cardId: "card-a",
        cardName: "Pikachu",
        cardNumber: "58/102",
        setName: "Base Set",
        variantName: "1st edition",
      }),
    );
  });
});

test("eBay data survives feature switches and clears for a new card", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  fireEvent.click(screen.getByRole("button", { name: "Open eBay Comps" }));

  await waitFor(() => {
    expect(screen.getByTestId("ebay-response")).toHaveTextContent(
      "eBay response 1",
    );
  });

  fireEvent.click(screen.getByRole("button", { name: /Collector's Value/ }));
  fireEvent.click(screen.getByRole("button", { name: /eBay Comps/ }));
  expect(screen.getByTestId("ebay-response")).toHaveTextContent(
    "eBay response 1",
  );
  expect(mocks.ebayRuns).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Open next card" }));
  await screen.findByRole("heading", { name: "Raichu" });

  expect(screen.getByTestId("ebay-response")).toHaveTextContent(
    "No eBay response",
  );
  expect(mocks.ebayRuns).toHaveBeenCalledTimes(1);
});

test("feature responses survive view switches and clear for a new card", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });

  fireEvent.click(screen.getByRole("button", { name: /Collector's Value/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Open Collector's Value" }),
  );
  await waitFor(() => {
    expect(screen.getByTestId("collector-response")).toHaveTextContent(
      "collector_analysis response",
    );
  });

  fireEvent.click(screen.getByRole("button", { name: /Grading/ }));
  const openGradingButton = screen.getByRole("button", {
    name: "Open Grading",
  });
  await waitFor(() => expect(openGradingButton).toBeEnabled(), {
    timeout: 2_000,
  });
  fireEvent.click(openGradingButton);
  await waitFor(() => {
    expect(screen.getByTestId("grading-response")).toHaveTextContent(
      "worth_grading response",
    );
  });

  fireEvent.click(screen.getByRole("button", { name: /Collector's Value/ }));
  expect(screen.getByTestId("collector-response")).toHaveTextContent(
    "collector_analysis response",
  );
  expect(mocks.askGrok).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole("button", { name: "Open next card" }));
  await screen.findByRole("heading", { name: "Raichu" });
  fireEvent.click(screen.getByRole("button", { name: /Collector's Value/ }));

  await waitFor(() => {
    expect(screen.getByTestId("collector-response")).toHaveTextContent(
      "No collector response",
    );
  });
  expect(
    screen.getByRole("button", { name: "Open Collector's Value" }),
  ).toBeEnabled();
  expect(mocks.askGrok).toHaveBeenCalledTimes(2);
});
