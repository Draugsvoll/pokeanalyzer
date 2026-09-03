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
  askMarketPrices: vi.fn(),
  ebayRuns: vi.fn(),
  fetchCardById: vi.fn(),
  fetchJustTcgCard: vi.fn(),
  hasSubscription: true,
  loadingSubscription: false,
  updateSubscription: vi.fn(),
  verifyJustTcgCard: vi.fn(),
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
    images: { large: `${id}-large.png`, small: `${id}-small.png` },
    name,
    number: "58",
    rarity: "Common",
    set: {
      id: "base1",
      images: { logo: "logo.png", symbol: "symbol.png" },
      legalities: { unlimited: "Legal" },
      name: "Base Set",
      printedTotal: 102,
      releaseDate: "1999/01/09",
      series: "Base",
      total: 102,
      updatedAt: "2026/01/01",
    },
  };
}

vi.mock("../../utils/grok/grokClient", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../utils/grok/grokClient")>();
  return {
    ...original,
    askGrok: mocks.askGrok,
    askMarketPrices: mocks.askMarketPrices,
  };
});

vi.mock("../../services/cardApi", () => ({
  fetchCardById: mocks.fetchCardById,
}));

vi.mock("../../utils/selectedPokemonCache", () => ({
  getSelectedPokemonFromCache: vi.fn(() => null),
  setSelectedPokemonCache: vi.fn(),
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
    creditsRemaining: 10,
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

vi.mock("../../utils/fetchJustTcgCard", () => ({
  fetchJustTcgCard: mocks.fetchJustTcgCard,
  verifyJustTcgCard: mocks.verifyJustTcgCard,
}));

vi.mock("../../components/loginmodal/Loginmodal", () => ({
  default: () => null,
}));

vi.mock("./components/CardFeatureHeader", () => ({
  CARD_FEATURE_HEADER_ACTION_LABEL: "Open",
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

vi.mock("./views/priceAnalysis/PriceAnalysis", () => ({
  PriceAnalysis: ({
    grokRequest,
    justTcgRequest,
    salesDataRequest,
  }: {
    grokRequest: GrokRequestState;
    justTcgRequest: { response: unknown };
    salesDataRequest: GrokRequestState;
  }) => (
    <div>
      <span data-testid="market-price-response">
        {grokRequest.response || "No market price response"}
      </span>
      <span data-testid="market-sales-response">
        {salesDataRequest.response || "No sales response"}
      </span>
      <span data-testid="justtcg-response">
        {justTcgRequest.response ? "JustTCG response" : "No JustTCG response"}
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
      </Routes>
    </>
  );
}

beforeEach(() => {
  mocks.authLoading = false;
  mocks.authUser = { uid: "user-1" };
  mocks.askGrok.mockReset();
  mocks.askMarketPrices.mockReset();
  mocks.ebayRuns.mockReset();
  mocks.fetchCardById.mockReset();
  mocks.fetchJustTcgCard.mockReset();
  mocks.hasSubscription = true;
  mocks.loadingSubscription = false;
  mocks.updateSubscription.mockReset();
  mocks.verifyJustTcgCard.mockReset();

  mocks.fetchCardById.mockImplementation(async (cardId: string) =>
    cardId === "card-a"
      ? buildCard("card-a", "Pikachu")
      : buildCard("card-b", "Raichu"),
  );
  mocks.askGrok.mockImplementation(async (feature: string) => ({
    fromDatabase: false,
    ok: true,
    subscription,
    text: `${feature} response`,
  }));
  mocks.askMarketPrices.mockResolvedValue({
    ok: true,
    priceAnalysis: {
      fromDatabase: false,
      ok: true,
      text: "market price response",
    },
    salesData: {
      fromDatabase: false,
      ok: true,
      text: "sales data response",
    },
    subscription,
  });
  mocks.fetchJustTcgCard.mockResolvedValue({ cards: [] });
  mocks.verifyJustTcgCard.mockReturnValue({ verified: true });
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

test("Market Analysis data survives feature view switches", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  fireEvent.click(screen.getByRole("button", { name: "Open Market Analysis" }));

  await waitFor(() => {
    expect(screen.getByTestId("market-price-response")).toHaveTextContent(
      "market price response",
    );
    expect(screen.getByTestId("market-sales-response")).toHaveTextContent(
      "sales data response",
    );
    expect(screen.getByTestId("justtcg-response")).toHaveTextContent(
      "JustTCG response",
    );
  });

  fireEvent.click(screen.getByRole("button", { name: /Collector's Value/ }));
  fireEvent.click(screen.getByRole("button", { name: /Market Analysis/ }));

  expect(screen.getByTestId("market-price-response")).toHaveTextContent(
    "market price response",
  );
  expect(screen.getByTestId("market-sales-response")).toHaveTextContent(
    "sales data response",
  );
  expect(screen.getByTestId("justtcg-response")).toHaveTextContent(
    "JustTCG response",
  );
  expect(mocks.askMarketPrices).toHaveBeenCalledTimes(1);
  expect(mocks.fetchJustTcgCard).toHaveBeenCalledTimes(1);
});

test("eBay data survives feature switches and clears for a new card", async () => {
  render(
    <MemoryRouter initialEntries={["/card/card-a"]}>
      <TestRoutes />
    </MemoryRouter>,
  );

  await screen.findByRole("heading", { name: "Pikachu" });
  fireEvent.click(screen.getByRole("button", { name: /eBay Comps/ }));
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
  fireEvent.click(screen.getByRole("button", { name: /eBay Comps/ }));

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
