import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import type { GrokRequestState } from "../../utils/grok/grokClient";
import PokemonDetails from "./PokemonDetails";

const mocks = vi.hoisted(() => ({
  authLoading: false,
  authUser: { uid: "user-1" } as { uid: string } | null,
  askGrok: vi.fn(),
  creditsRemaining: 10,
  authenticatedFetch: vi.fn(),
  ebayCreditsRemaining: 10,
  ebayCreditsLoading: false,
  updateEbayCredits: vi.fn(),
  refreshEbayCredits: vi.fn(),
  fetchCardById: vi.fn(),
  fetchCardPriceHistory: vi.fn(),
  fetchMarketPriceHistory: vi.fn(),
  hasSubscription: true,
  loadingSubscription: false,
  updateSubscription: vi.fn(),
  refreshSubscription: vi.fn(),
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
  fetchCardPriceHistory: mocks.fetchCardPriceHistory,
  fetchMarketPriceHistory: mocks.fetchMarketPriceHistory,
}));

vi.mock("../../services/pokeTraceSets", () => ({
  loadPokeTraceSet: vi
    .fn()
    .mockResolvedValue({ cards: [], salesLeaders: { total: null } }),
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
    refreshSubscription: mocks.refreshSubscription,
  }),
}));

vi.mock("../../utils/authenticatedFetch", () => ({
  authenticatedFetch: mocks.authenticatedFetch,
}));

vi.mock("../../ebay/useEbayCredits", () => ({
  useEbayCredits: () => ({
    credits: {
      creditsRemaining: mocks.ebayCreditsRemaining,
      planId: "free",
    },
    loading: mocks.ebayCreditsLoading,
    error: "",
    updateCredits: mocks.updateEbayCredits,
    refreshCredits: mocks.refreshEbayCredits,
  }),
}));

vi.mock("../../context/watchlistCacheContextValue", () => ({
  useWatchlistCache: () => ({
    isItemUpdating: () => false,
    isItemSaved: () => false,
    loadingReferences: false,
    referencesError: null,
  }),
}));
vi.mock("../../hooks/useWatchlist", () => ({
  useWatchlist: () => ({ setWatched: vi.fn() }),
}));

vi.mock("../../context/portfolioCacheContextValue", () => ({
  usePortfolioCache: () => ({
    isItemUpdating: () => false,
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

vi.mock("./components/CardFeatureHeader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./components/CardFeatureHeader")>();
  return {
    CARD_FEATURE_VARIANTS_ID: "card-feature-variants",
    CardFeatureHeader: (
      props: Parameters<typeof actual.CardFeatureHeader>[0],
    ) => {
      if (props.label === "Ebay Explorer")
        return <actual.CardFeatureHeader {...props} />;
      const {
        actionLabel,
        actionDisabled,
        actionHidden,
        actionLoading,
        label,
        onAction,
      }: {
        actionLabel?: string;
        actionDisabled?: boolean;
        actionHidden?: boolean;
        actionLoading?: boolean;
        label: string;
        onAction?: () => void;
      } = props;
      return (
        <header>
          <span>{label}</span>
          {props.errorMessage && <p role="alert">{props.errorMessage}</p>}
          {onAction && !actionHidden && (
            <button
              data-testid="feature-action"
              data-credit-label={actionLabel}
              type="button"
              disabled={actionDisabled || actionLoading}
              aria-busy={actionLoading}
              onClick={onAction}
            >
              {actionLoading ? `Loading ${label}` : `Open ${label}`}
            </button>
          )}
          {actionLoading && props.actionLoadingMessage && (
            <p role="status">{props.actionLoadingMessage}</p>
          )}
        </header>
      );
    },
  };
});

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

vi.mock("./views/EbaySold/EbaySoldView", () => ({
  default: ({
    response,
    children,
  }: {
    response: { label: string } | null;
    children?: ReactNode;
  }) => (
    <>
      {children}
      {response && <div data-testid="ebay-response">{response.label}</div>}
    </>
  ),
}));

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
  mocks.ebayCreditsRemaining = 10;
  mocks.ebayCreditsLoading = false;
  mocks.authenticatedFetch.mockReset();
  mocks.updateEbayCredits.mockReset();
  mocks.refreshEbayCredits.mockReset().mockResolvedValue(undefined);
  mocks.authenticatedFetch.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          data: {
            label: "Ebay response",
            sold: { items: [] },
            active: { items: [] },
          },
          credits: { creditsRemaining: 9, version: 1 },
          fromDatabase: false,
        }),
      ),
  );
  mocks.fetchCardById.mockReset();
  mocks.fetchCardPriceHistory.mockReset();
  mocks.fetchMarketPriceHistory.mockReset();
  mocks.hasSubscription = true;
  mocks.loadingSubscription = false;
  mocks.updateSubscription.mockReset();
  mocks.refreshSubscription.mockReset();

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
  mocks.fetchCardPriceHistory.mockImplementation(async (cardId: string) => ({
    cardId,
    days: 9,
    snapshots: [],
  }));
  mocks.askGrok.mockImplementation(async (feature: string) => ({
    fromDatabase: false,
    ok: true,
    subscription,
    text: `${feature} response`,
  }));
});

test("shows links to the card directory and current set in the breadcrumb", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  const breadcrumb = await screen.findByRole("navigation", {
    name: "Breadcrumb",
  });

  expect(breadcrumb.closest(".details-page")).toHaveClass(
    "card-view--poketrace",
  );
  expect(
    within(breadcrumb).getByRole("link", { name: "Cards" }),
  ).toHaveAttribute("href", "/search");
  expect(
    within(breadcrumb).getByRole("link", { name: "Base Set" }),
  ).toHaveAttribute("href", "/set?set=Base%20Set");
  expect(within(breadcrumb).getByText("Pikachu")).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test.each([
  ["Grading", "Building grading report..."],
  ["Collector Insights", "Building collector report..."],
  ["Market Analysis", "Building market report..."],
])("shows %s loading text inside its header", async (feature, message) => {
  let resolveRequest!: (value: unknown) => void;
  mocks.askGrok.mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  );
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );
  await screen.findByTestId("feature-action");
  expect(screen.queryByText(message)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(feature) }));
  fireEvent.click(screen.getByTestId("feature-action"));
  const status = await screen.findByText(message);
  expect(
    screen.getByTestId("feature-action").closest("header"),
  ).toContainElement(status);
  expect(screen.getAllByText(message)).toHaveLength(1);
  await act(async () => resolveRequest({ ok: false, status: 502 }));
  expect(screen.queryByText(message)).not.toBeInTheDocument();
  expect(
    screen.getByTestId("feature-action").closest("header"),
  ).toContainElement(screen.getByRole("alert"));
});

test.each(["Grading", "Collector Insights", "Market Analysis"])(
  "keeps the %s request error inside its header",
  async (feature) => {
    mocks.askGrok.mockResolvedValue({ ok: false, status: 502 });
    render(
      <MemoryRouter initialEntries={["/card/card-a"]}>
        <TestRoutes />
      </MemoryRouter>,
    );
    await screen.findByTestId("feature-action");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(feature) }));
    fireEvent.click(screen.getByTestId("feature-action"));
    const alert = await screen.findByRole("alert");
    expect(
      screen.getByTestId("feature-action").closest("header"),
    ).toContainElement(alert);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  },
);

test("places the card number between the title and rarity without repeating the set", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  const title = await screen.findByRole("heading", {
    name: "Pikachu",
    level: 1,
  });
  const number = screen.getByLabelText("Card number 058/102");
  const rarity = screen.getByText("Common");

  expect(title.compareDocumentPosition(number)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(number.compareDocumentPosition(rarity)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  const cardDetails = title.closest(".details-page__primary") as HTMLElement;
  expect(within(cardDetails).getAllByText("Base Set")).toHaveLength(1);
});

test("keeps the embedded card search open while using its controls", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
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
  const clearFilters = screen.getByRole("button", { name: "Clear filters" });
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

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
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

test("shows membership pricing at the bottom of the demo card page", async () => {
  render(
    <MemoryRouter initialEntries={["/card/demo"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  expect(
    await screen.findByRole("heading", { name: "Compare plans" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Choose Collector" }),
  ).toBeVisible();
});

test("contains focus and lets autocomplete dismiss itself before the dialog", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
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

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
  fireEvent.click(screen.getByRole("button", { name: /^Market Analysis/ }));
  let actionButton = screen.getByRole("button", {
    name: "Loading Market Analysis",
  });

  expect(actionButton).toBeDisabled();
  expect(actionButton).toHaveAttribute("aria-busy", "true");

  mocks.authLoading = false;
  mocks.authUser = { uid: "user-1" };
  rerender(renderView());

  actionButton = screen.getByRole("button", {
    name: "Loading Market Analysis",
  });
  expect(actionButton).toBeDisabled();

  mocks.hasSubscription = true;
  mocks.loadingSubscription = false;
  rerender(renderView());

  actionButton = screen.getByRole("button", {
    name: "Open Market Analysis",
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

test("offers a top-up for grading with one credit while other features remain affordable", async () => {
  mocks.creditsRemaining = 1;
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  const action = await screen.findByTestId("feature-action");
  expect(action).toHaveAttribute("data-credit-label", "1 AI credit");
  expect(action).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: /Grading/ }));
  expect(screen.getByTestId("feature-action")).toHaveAttribute(
    "data-credit-label",
    "Add credits",
  );
  fireEvent.click(screen.getByTestId("feature-action"));

  expect(await screen.findByText("Profile page")).toBeVisible();
  expect(mocks.askGrok).not.toHaveBeenCalled();
});

test("offers grading for two credits when the balance is exactly two", async () => {
  mocks.creditsRemaining = 2;
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByTestId("feature-action");
  fireEvent.click(screen.getByRole("button", { name: /Grading/ }));
  const action = screen.getByTestId("feature-action");
  expect(action).toHaveAttribute("data-credit-label", "2 AI credits");
  expect(action).toBeEnabled();
  fireEvent.click(action);

  await waitFor(() => {
    expect(mocks.askGrok).toHaveBeenCalledWith(
      "worth_grading",
      expect.any(Object),
    );
  });
});

test.each(["Grading", "Collector Insights", "Market Analysis"])(
  "%s refreshes a stale balance after a credit rejection and offers a top-up",
  async (feature) => {
    mocks.askGrok.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Unavailable",
    });
    mocks.refreshSubscription.mockImplementation(async () => {
      mocks.creditsRemaining = 0;
      return { ...subscription, membershipCreditsRemaining: 0 };
    });

    render(
      <MemoryRouter initialEntries={["/card/card-a"]}>
        <TestRoutes />
      </MemoryRouter>,
    );

    await screen.findByTestId("feature-action");
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${feature}`) }),
    );
    fireEvent.click(screen.getByTestId("feature-action"));

    await waitFor(() => {
      expect(mocks.refreshSubscription).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("feature-action")).toHaveAttribute(
        "data-credit-label",
        "Add credits",
      );
      expect(screen.getByTestId("feature-action")).toBeEnabled();
    });
    expect(mocks.askGrok).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("feature-action"));
    expect(await screen.findByText("Profile page")).toBeVisible();
  },
);

test("does not refresh the balance for an unrelated analysis failure", async () => {
  mocks.askGrok.mockResolvedValue({
    ok: false,
    status: 502,
    error: "Unavailable",
  });
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByTestId("feature-action");
  fireEvent.click(screen.getByRole("button", { name: /^Grading/ }));
  fireEvent.click(screen.getByTestId("feature-action"));

  await waitFor(() => {
    expect(mocks.askGrok).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("feature-action")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });
  expect(mocks.refreshSubscription).not.toHaveBeenCalled();
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

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
  fireEvent.click(screen.getByRole("radio", { name: "Holofoil" }));
  expect(
    screen.getByRole("heading", { name: "Pikachu", level: 1 }),
  ).toBeInTheDocument();
  const variantLoading = screen.getByRole("status", {
    name: "Loading market data",
  });
  expect(variantLoading).toBeInTheDocument();
  expect(variantLoading.closest(".poketrace-market")).not.toBeNull();
  expect(
    screen.queryByRole("status", { name: "Loading Ebay prices" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Loading Pok/)).not.toBeInTheDocument();

  resolveCardB(cardB);
  await screen.findByRole("heading", { name: "Raichu", level: 1 });

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
    screen.getByRole("heading", { name: "Cached Pikachu", level: 1 }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "Loading complete card details" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("status", { name: "Loading market data" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("$10.00")).toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "Loading Ebay prices" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "Loading graded prices" }),
  ).toBeInTheDocument();
  expect(screen.queryAllByText("No price data")).toHaveLength(0);
  expect(screen.queryByText("No graded prices")).not.toBeInTheDocument();
  expect(screen.queryByText(/Loading Pok/)).not.toBeInTheDocument();

  resolveRequest(completeCard);
  await screen.findByRole("heading", { name: "Complete Pikachu", level: 1 });
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
    "Card details couldn’t be refreshed.",
  );
  expect(screen.getByText("$10.00")).toBeInTheDocument();
  expect(screen.queryAllByText("No price data")).toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  await screen.findByRole("heading", { name: "Complete Pikachu", level: 1 });
  expect(mocks.fetchCardById).toHaveBeenCalledTimes(2);
});

test("Market Analysis fetches the stored market report", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
  fireEvent.click(screen.getByRole("button", { name: /^Market Analysis/ }));
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

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
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

test("Ebay data survives feature switches and clears for a new card", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
  fireEvent.click(screen.getByRole("button", { name: "1 Ebay credit" }));

  await waitFor(() => {
    expect(screen.getByTestId("ebay-response")).toHaveTextContent(
      "Ebay response",
    );
  });

  fireEvent.click(screen.getByRole("button", { name: /Collector Insights/ }));
  expect(screen.getByTestId("ebay-response")).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Ebay Explorer" }));
  expect(screen.getByTestId("ebay-response")).toBeVisible();
  expect(screen.getByTestId("ebay-response")).toHaveTextContent(
    "Ebay response",
  );
  expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Open next card" }));
  await screen.findByRole("heading", { name: "Raichu", level: 1 });

  expect(screen.queryByTestId("ebay-response")).not.toBeInTheDocument();
  expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
});

test("feature responses survive view switches and clear for a new card", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu", level: 1 });

  fireEvent.click(screen.getByRole("button", { name: /Collector Insights/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Open Collector Insights" }),
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

  fireEvent.click(screen.getByRole("button", { name: /Collector Insights/ }));
  expect(screen.getByTestId("collector-response")).toHaveTextContent(
    "collector_analysis response",
  );
  expect(mocks.askGrok).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole("button", { name: "Open next card" }));
  await screen.findByRole("heading", { name: "Raichu", level: 1 });
  fireEvent.click(screen.getByRole("button", { name: /Collector Insights/ }));

  await waitFor(() => {
    expect(screen.getByTestId("collector-response")).toHaveTextContent(
      "No collector response",
    );
  });
  expect(
    screen.getByRole("button", { name: "Open Collector Insights" }),
  ).toBeEnabled();
  expect(mocks.askGrok).toHaveBeenCalledTimes(2);
});

test("opens the Ebay tab in the shared feature layout without an automatic request", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  const title = await screen.findByRole("heading", {
    name: "Pikachu",
    level: 1,
  });
  const primary = title.closest(".details-page__primary")!;
  const ebay = screen.getByRole("region", { name: "Ebay sales and listings" });
  const ai = screen.getByRole("region", { name: "Card insights" });
  expect(primary.nextElementSibling).toBe(ai);
  expect(ai).toContainElement(ebay);
  expect(
    within(ai).getByRole("button", { name: "Ebay Explorer" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("button", { name: /^Market Analysis/ }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(ebay).toBeVisible();
  expect(screen.getByTestId("feature-action")).not.toBeVisible();
  expect(mocks.askGrok).not.toHaveBeenCalled();
  expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
});

test("runs Ebay and AI simultaneously and updates only their respective credits", async () => {
  let resolveEbay!: (response: Response) => void;
  let resolveAi!: (response: unknown) => void;
  mocks.authenticatedFetch.mockReturnValue(
    new Promise<Response>((resolve) => {
      resolveEbay = resolve;
    }),
  );
  mocks.askGrok.mockReturnValue(
    new Promise((resolve) => {
      resolveAi = resolve;
    }),
  );

  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Pikachu", level: 1 });
  fireEvent.click(screen.getByRole("button", { name: "1 Ebay credit" }));
  fireEvent.click(screen.getByRole("button", { name: /^Market Analysis/ }));
  expect(
    screen.getByRole("button", { name: "Open Market Analysis" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: /^Collector Insights/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Open Collector Insights" }),
  );
  expect(mocks.askGrok).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Ebay Explorer" }));
  expect(
    screen.getByRole("button", { name: "Searching Ebay..." }),
  ).toBeDisabled();
  const ebayTab = screen.getByRole("button", { name: "Ebay Explorer" });
  expect(ebayTab).toBeEnabled();
  expect(ebayTab).toHaveAttribute("aria-busy", "true");
  expect(ebayTab.querySelector(".feature-button__spinner")).not.toBeNull();

  await act(async () => {
    resolveEbay(
      new Response(
        JSON.stringify({
          data: {
            label: "independent Ebay results",
            sold: { items: [] },
            active: { items: [] },
          },
          credits: { creditsRemaining: 9, version: 1 },
        }),
      ),
    );
  });
  expect(screen.getByTestId("ebay-response")).toHaveTextContent(
    "independent Ebay results",
  );
  expect(mocks.updateEbayCredits).toHaveBeenCalledTimes(1);
  expect(ebayTab).toHaveAttribute("aria-busy", "false");
  expect(ebayTab.querySelector(".feature-button__spinner")).toBeNull();
  expect(mocks.updateSubscription).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^Collector Insights/ }));
  expect(
    screen.getByRole("button", { name: "Loading Collector Insights" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Ebay Explorer" }));
  const ebaySection = screen.getByRole("region", {
    name: "Ebay sales and listings",
  });
  expect(within(ebaySection).getByTestId("ebay-response")).toBeVisible();
  expect(
    within(ebaySection).queryByRole("heading", { name: "Ebay Explorer" }),
  ).not.toBeInTheDocument();
  expect(
    within(ebaySection).queryByRole("button", {
      name: /1 Ebay credit|Hide results|Show results/,
    }),
  ).not.toBeInTheDocument();

  await act(async () => {
    resolveAi({
      ok: true,
      fromDatabase: false,
      subscription,
      text: "independent AI results",
    });
  });
  expect(screen.getByTestId("collector-response")).toHaveTextContent(
    "independent AI results",
  );
  expect(screen.getByTestId("ebay-response")).toHaveTextContent(
    "independent Ebay results",
  );
  expect(mocks.updateEbayCredits).toHaveBeenCalledTimes(1);
  expect(mocks.updateSubscription).toHaveBeenCalledTimes(1);
});

test("AI loading and credit refreshes do not disable Ebay", async () => {
  mocks.loadingSubscription = true;
  mocks.creditsRemaining = 0;
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );
  const action = await screen.findByRole("button", { name: "1 Ebay credit" });
  expect(action).toBeEnabled();
  fireEvent.click(action);
  expect(await screen.findByTestId("ebay-response")).toBeVisible();
  expect(mocks.updateSubscription).not.toHaveBeenCalled();
  expect(mocks.refreshSubscription).not.toHaveBeenCalled();
});

test("Ebay credit rejection stays local while AI actions remain available", async () => {
  mocks.authenticatedFetch.mockResolvedValue(
    new Response("{}", { status: 409 }),
  );
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "1 Ebay credit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "enough Ebay credits",
  );
  fireEvent.click(screen.getByRole("button", { name: /^Market Analysis/ }));
  expect(
    screen.getByRole("button", { name: "Open Market Analysis" }),
  ).toBeEnabled();
  expect(mocks.refreshEbayCredits).toHaveBeenCalledTimes(1);
  expect(mocks.refreshSubscription).not.toHaveBeenCalled();
});
