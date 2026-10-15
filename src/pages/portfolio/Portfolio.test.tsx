import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PortfolioProvider } from "../../context/PortfolioCacheContext";
import { WatchlistProvider } from "../../context/WatchlistCacheContext";
import { NotificationProvider } from "../../context/NotificationContext";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { useWatchlist } from "../../hooks/useWatchlist";
import type { PortfolioSingle } from "../../types/portfolio";
import Portfolio from "./Portfolio";

const mocks = vi.hoisted(() => ({
  auth: {
    loading: false,
    user: null as null | { uid: string },
  },
  getHydratedPortfolio: vi.fn(),
  getHydratedWatchlist: vi.fn(),
  addPortfolio: vi.fn(),
  removePortfolio: vi.fn(),
  updateQuantity: vi.fn(),
  addWatchlist: vi.fn(),
  removeWatchlist: vi.fn(),
}));

vi.mock("../../context/authContextValue", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("../../services/watchlistApi", () => ({
  getHydratedWatchlist: mocks.getHydratedWatchlist,
  getWatchlistReferences: async () => ({ entries: [] }),
  addWatchlistItem: mocks.addWatchlist,
  removeWatchlistItem: mocks.removeWatchlist,
}));

vi.mock("../../services/portfolioApi", () => ({
  getHydratedPortfolio: mocks.getHydratedPortfolio,
  getPortfolioReferences: async () => ({ entries: [] }),
  addPortfolioCard: mocks.addPortfolio,
  removePortfolioCard: mocks.removePortfolio,
  updatePortfolioCardQuantity: mocks.updateQuantity,
}));

vi.mock("../../components/loginmodal/Loginmodal", () => ({
  default: () => null,
}));

vi.mock("../../components/databaseSearch/DatabaseSearch", () => ({
  DatabaseSearch: ({
    initialProductType,
  }: {
    initialProductType?: "singles" | "sealed";
  }) => {
    const { savePokemonToPortfolio } = usePokemonPortfolio();
    const { setWatched } = useWatchlist();
    return (
      <>
        <output aria-label="Initial product type">{initialProductType}</output>
        <button onClick={() => void savePokemonToPortfolio(searchCard())}>
          Save search result
        </button>
        <button onClick={() => void setWatched(searchCard(), true)}>
          Watch search result
        </button>
      </>
    );
  },
}));

vi.mock("../../components/pokemonCardView/PokemonCardView", () => ({
  PokemonCardView: ({ card }: { card: PortfolioSingle }) => {
    const { setWatched } = useWatchlist();
    const { savePokemonToPortfolio } = usePokemonPortfolio();
    return (
      <div>
        Watchlist card: {card.name}
        <button onClick={() => void setWatched(card, false)}>
          Remove watched card
        </button>
        <button onClick={() => void savePokemonToPortfolio(card)}>
          Collect watched card
        </button>
      </div>
    );
  },
  PokemonCardPortfolioView: ({ card }: { card: PortfolioSingle }) => {
    const { setWatched } = useWatchlist();
    const { updatePokemonQuantity, removePokemonFromPortfolio } =
      usePokemonPortfolio();
    return (
      <div>
        Portfolio card: {card.name}
        <button onClick={() => void setWatched(card, true)}>
          Watch collection card
        </button>
        <button onClick={() => void updatePokemonQuantity(card.id, 3)}>
          Set quantity to three
        </button>
        <button onClick={() => void removePokemonFromPortfolio(card.id, false)}>
          Remove collected card
        </button>
      </div>
    );
  },
}));

vi.mock("../../components/sealedProductView/SealedProductView", () => ({
  SealedProductView: ({ product }: { product: { name: string } }) => (
    <div>Watchlist sealed: {product.name}</div>
  ),
  SealedProductPortfolioView: ({ product }: { product: { name: string } }) => (
    <div>Portfolio sealed: {product.name}</div>
  ),
}));

function collectionCard(): PortfolioSingle {
  return {
    id: "base-4",
    image: "https://example.com/charizard.webp",
    name: "Charizard",
    number: "4/102",
    quantity: 2,
    type: "single",
    set: { id: "base", name: "Base Set" },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices: { tcgplayer: { NEAR_MINT: { avg: 100 } } },
    },
    priceSnapshots: {
      "30d": {
        marketPrice: 50,
        recordedAt: "2026-08-29T00:00:00.000Z",
        sourceUpdatedAt: null,
      },
      "7d": {
        marketPrice: 80,
        recordedAt: "2026-09-20T00:00:00.000Z",
        sourceUpdatedAt: null,
      },
    },
  };
}

function searchCard(): PortfolioSingle {
  return {
    ...collectionCard(),
    id: "base-2",
    name: "Blastoise",
    number: "2/102",
    quantity: 1,
  };
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/portfolio"]}>
      <NotificationProvider>
        <PortfolioProvider>
          <WatchlistProvider>{children}</WatchlistProvider>
        </PortfolioProvider>
      </NotificationProvider>
    </MemoryRouter>
  );
}

function renderPortfolio() {
  return render(
    <Providers>
      <Portfolio />
    </Providers>,
  );
}

describe("Portfolio", () => {
  beforeEach(() => {
    mocks.auth.loading = false;
    mocks.auth.user = null;
    mocks.getHydratedPortfolio.mockReset();
    mocks.getHydratedWatchlist
      .mockReset()
      .mockResolvedValue({ items: [], entries: [], missingItems: [] });
    mocks.addPortfolio.mockReset().mockImplementation(async (id) => ({
      created: true,
      entry: { id, type: "single", quantity: 1 },
    }));
    mocks.removePortfolio.mockReset().mockResolvedValue(undefined);
    mocks.updateQuantity
      .mockReset()
      .mockImplementation(async (id, quantity) => ({
        id,
        type: "single",
        quantity,
      }));
    mocks.addWatchlist.mockReset().mockImplementation(async (type, id) => ({
      created: true,
      entry: { id, type },
    }));
    mocks.removeWatchlist.mockReset().mockResolvedValue(undefined);
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
      items: [collectionCard()],
      entries: [{ id: "base-4", type: "single", quantity: 2 }],
      missingItems: [],
    });

    renderPortfolio();

    expect(screen.getByRole("status")).toHaveTextContent("Loading collection");
    expect(
      screen.queryByRole("region", { name: "Collection summary" }),
    ).toBeNull();
    expect((await screen.findAllByText("$200.00"))[0]).toBeVisible();
    const valueMetric = screen.getByText("Collection value").closest("article");
    expect(valueMetric?.closest(".portfolio__summary")).toHaveClass(
      "app-overview-panel",
    );
    expect(valueMetric).toHaveClass(
      "app-overview-metric",
      "app-overview-metric--primary",
    );
    expect(
      valueMetric?.querySelector(".app-overview-metric-content"),
    ).not.toBeNull();
    expect(valueMetric).toHaveTextContent("$200.0025.0%7d");
    expect(
      valueMetric!.querySelector(".app-price-change__arrow--up"),
    ).not.toBeNull();
    const bestPerformerMetric = screen
      .getByText("Best performer")
      .closest("article");
    expect(bestPerformerMetric).toHaveTextContent("$100.0025.0%7d");
    expect(bestPerformerMetric).toHaveTextContent("4/102");
    expect(bestPerformerMetric).toHaveTextContent("Charizard");
    expect(
      screen.getByText("Worst performer").closest("article"),
    ).toHaveTextContent("Charizard");
    expect(screen.getByText("Portfolio card: Charizard")).toBeVisible();
    const mostValuableMetric = screen
      .getByText("Most valuable")
      .closest("article");
    expect(mostValuableMetric).not.toBeNull();
    expect(mostValuableMetric!.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/charizard.webp",
    );
    expect(
      mostValuableMetric!.querySelector(
        ".app-overview-metric-content .app-card-identity",
      ),
    ).toHaveTextContent("4/102Charizard");
    expect(screen.queryByText("Collection cards")).toBeNull();
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
  });

  test.each([
    ["collection", "4/102", "Charizard 004/102"],
    ["watchlist", "4/102", "Charizard 004/102"],
    ["collection", undefined, "Charizard"],
    ["watchlist", undefined, "Charizard"],
  ] as const)(
    "filters %s from featured metrics with number %s",
    async (mode, number, expected) => {
      mocks.auth.user = { uid: "user-1" };
      const items = [{ ...collectionCard(), number }, searchCard()];
      const response = {
        items,
        entries: items.map(({ id, type, quantity }) => ({
          id,
          type,
          quantity,
        })),
        missingItems: [],
      };
      mocks.getHydratedPortfolio.mockResolvedValue(response);
      mocks.getHydratedWatchlist.mockResolvedValue(response);
      renderPortfolio();
      await screen.findByText("Portfolio card: Charizard");
      if (mode === "watchlist") {
        fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
      }
      const filter = screen.getByRole("searchbox", {
        name: `Search your ${mode}`,
      });
      for (const label of [
        "Best performer",
        "Worst performer",
        "Most valuable",
      ]) {
        fireEvent.change(filter, { target: { value: "Blastoise" } });
        fireEvent.click(
          within(screen.getByText(label).closest("article")!).getByRole(
            "button",
          ),
        );
        expect(filter).toHaveValue(expected);
        await waitFor(() => {
          expect(filter).toHaveFocus();
          expect((filter as HTMLInputElement).selectionStart).toBe(
            expected.length,
          );
          expect((filter as HTMLInputElement).selectionEnd).toBe(
            expected.length,
          );
        });
        expect(
          screen.getByText(
            `${mode === "collection" ? "Portfolio" : "Watchlist"} card: Charizard`,
          ),
        ).toBeVisible();
        expect(screen.queryByText(/card: Blastoise/)).toBeNull();
      }
      expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
      expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(1);
    },
  );

  test("opens the embedded card search from Add singles", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [collectionCard()],
      entries: [{ id: "base-4", type: "single", quantity: 2 }],
      missingItems: [],
    });

    renderPortfolio();

    const trigger = await screen.findByRole("button", { name: "Add singles" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(
      await screen.findByRole("dialog", { name: "Add singles" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Initial product type")).toHaveTextContent(
      "singles",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close card search" }));

    expect(screen.queryByRole("dialog", { name: "Add singles" })).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("opens the embedded search on sealed from Add sealed", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [collectionCard()],
      entries: [{ id: "base-4", type: "single", quantity: 2 }],
      missingItems: [],
    });

    renderPortfolio();

    const trigger = await screen.findByRole("button", { name: "Add sealed" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(
      await screen.findByRole("dialog", { name: "Add sealed" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Initial product type")).toHaveTextContent(
      "sealed",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close card search" }));

    expect(screen.queryByRole("dialog", { name: "Add sealed" })).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("shows one combined asset count with a singles and sealed breakdown", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [
        collectionCard(),
        {
          currency: "USD",
          id: "sealed-1",
          name: "Base Set Booster Box",
          price: 150,
          priceSnapshots: { "1d": null, "7d": 125, "30d": null },
          productFamily: "booster_box",
          quantity: 3,
          setName: "Base Set",
          type: "sealed",
        },
      ],
      entries: [
        { id: "base-4", type: "single", quantity: 2 },
        { id: "sealed-1", type: "sealed", quantity: 3 },
      ],
      missingItems: [],
    });

    renderPortfolio();

    await screen.findByText("Portfolio sealed: Base Set Booster Box");
    const assetsMetric = screen.getByText("Assets").closest("article");
    expect(assetsMetric).toHaveTextContent("5");
    expect(assetsMetric).toHaveTextContent("2 singles");
    expect(assetsMetric).toHaveTextContent("3 sealed");
    expect(
      screen.getByText("Portfolio sealed: Base Set Booster Box"),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Most valuable: filter by Base Set Booster Box",
      }),
    );
    expect(
      screen.getByRole("searchbox", { name: "Search your collection" }),
    ).toHaveValue("Base Set Booster Box");
    expect(
      screen.getByText("Portfolio sealed: Base Set Booster Box"),
    ).toBeVisible();
    expect(screen.queryByText("Portfolio card: Charizard")).toBeNull();
  });

  test("updates the portfolio from a confirmed search save without refetching", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [collectionCard()],
      entries: [{ id: "base-4", type: "single", quantity: 2 }],
      missingItems: [],
    });

    renderPortfolio();
    const trigger = await screen.findByRole("button", { name: "Add singles" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Save search result" }));

    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close card search" }));

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(await screen.findByText("Portfolio card: Blastoise")).toBeVisible();
  });

  test("renders zero changes with the shared muted downward arrow", async () => {
    mocks.auth.user = { uid: "user-1" };
    const unchangedCard = collectionCard();
    unchangedCard.priceSnapshots = {
      "7d": {
        marketPrice: 100,
        recordedAt: "2026-09-20T00:00:00.000Z",
        sourceUpdatedAt: null,
      },
    };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [unchangedCard],
      entries: [{ id: "base-4", type: "single", quantity: 2 }],
      missingItems: [],
    });

    renderPortfolio();

    await screen.findAllByText("$200.00");
    for (const label of [
      "Collection value",
      "Best performer",
      "Worst performer",
      "Most valuable",
    ]) {
      const metric = screen.getByText(label).closest("article");
      expect(metric).not.toBeNull();
      expect(
        metric!.querySelector(".app-price-change__arrow--flat"),
      ).not.toBeNull();
    }
  });

  test("updates summary periods and the best performer from the selected comparison", async () => {
    mocks.auth.user = { uid: "user-1" };
    const charizard = collectionCard();
    const blastoise: PortfolioSingle = {
      ...charizard,
      id: "base-2",
      image: "https://example.com/blastoise.webp",
      name: "Blastoise",
      number: "2/102",
      pokeTrace: {
        ...charizard.pokeTrace,
        prices: { tcgplayer: { NEAR_MINT: { avg: 120 } } },
      },
      priceSnapshots: {
        "7d": {
          marketPrice: 60,
          recordedAt: "2026-09-20T00:00:00.000Z",
          sourceUpdatedAt: null,
        },
        "30d": {
          marketPrice: 100,
          recordedAt: "2026-08-29T00:00:00.000Z",
          sourceUpdatedAt: null,
        },
      },
      quantity: 1,
    };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [charizard, blastoise],
      entries: [
        { id: "base-4", type: "single", quantity: 2 },
        { id: "base-2", type: "single", quantity: 1 },
      ],
      missingItems: [],
    });

    renderPortfolio();
    await screen.findByText("Portfolio card: Charizard");

    const bestPerformer = screen.getByText("Best performer").closest("article");
    const weakestPerformer = screen
      .getByText("Worst performer")
      .closest("article");
    expect(bestPerformer).toHaveTextContent("Blastoise");
    expect(weakestPerformer).toHaveTextContent("Charizard");
    expect(
      bestPerformer!.querySelector(".app-price-change__period"),
    ).toHaveTextContent("7d");

    const periodControl = screen.getByRole("radiogroup", {
      name: "Price change period",
    });
    expect(periodControl).toHaveClass("price-change-period-selector");
    fireEvent.click(screen.getByRole("radio", { name: "30D" }));

    expect(
      screen.getByText("Best performer").closest("article"),
    ).toHaveTextContent("Charizard");
    expect(
      screen.getByText("Worst performer").closest("article"),
    ).toHaveTextContent("Blastoise");
    for (const label of [
      "Collection value",
      "Best performer",
      "Worst performer",
      "Most valuable",
    ]) {
      const metric = screen.getByText(label).closest("article");
      expect(metric).not.toBeNull();
      expect(
        metric!.querySelector(".app-price-change__period"),
      ).toHaveTextContent("30d");
    }
  });

  test("shows the header and list switch inside the empty box without an overview", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [],
      entries: [],
      missingItems: [],
    });

    renderPortfolio();

    const emptyHeading = await screen.findByRole("heading", {
      name: "Your collection is empty",
    });
    expect(emptyHeading.closest("section")).toHaveClass("default-container");
    expect(
      screen.getByRole("heading", { name: "My collection" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Collection summary" }),
    ).toBeNull();
    expect(emptyHeading.closest("section")).toContainElement(
      screen.getByRole("radiogroup", { name: "Saved list" }),
    );
    expect(screen.getByRole("button", { name: "Add singles" })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
    expect(screen.getByRole("heading", { name: "My watchlist" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Your watchlist is empty" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Watchlist summary" }),
    ).toBeNull();
    expect(screen.getByRole("radio", { name: "Collection" })).toBeVisible();
  });

  test("offers recovery when collection loading fails", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockRejectedValue(
      new Error("Network unavailable"),
    );

    renderPortfolio();

    expect(
      await screen.findByRole("heading", {
        name: "We couldn't load your collection",
      }),
    ).toBeVisible();
    expect(screen.getByText("Please try again in a moment.")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "My collection" }),
    ).toBeVisible();
    expect(screen.queryByText("Network unavailable")).toBeNull();
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
  test("switches between independent lists, counts watchlist assets once, and removes watched items", async () => {
    mocks.auth.user = { uid: "user-1" };
    const card = collectionCard();
    const { quantity, ...watched } = card;
    expect(quantity).toBe(2);
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [card],
      entries: [{ id: card.id, type: "single", quantity: 2 }],
      missingItems: [],
    });
    mocks.getHydratedWatchlist.mockResolvedValue({
      items: [watched],
      entries: [{ id: card.id, type: "single" }],
      missingItems: [],
    });
    renderPortfolio();
    await screen.findByText("Portfolio card: Charizard");
    expect(screen.queryByText(/have price data/)).toBeNull();
    const watchlistRadio = screen.getByRole("radio", { name: "Watchlist" });
    watchlistRadio.focus();
    fireEvent.click(watchlistRadio);
    expect(screen.queryByText(/^Loading (collection|watchlist)$/)).toBeNull();
    expect(screen.getByText("Watchlist card: Charizard")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Watchlist" })).toHaveFocus();
    const value = screen.getByText("Watchlist value");
    expect(value.closest("article")).toHaveTextContent("$100.00");
    expect(screen.getByText("Assets").closest("article")).toHaveTextContent(
      "1 single",
    );
    expect(screen.getByText("Watchlist card: Charizard")).toBeVisible();
    expect(screen.queryByText("Portfolio card: Charizard")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove watched card" }),
    );
    expect(await screen.findByText("Your watchlist is empty")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "Collection" }));
    await screen.findByText("Portfolio card: Charizard");
    expect(
      screen.getByText("Collection value").closest("article"),
    ).toHaveTextContent("$200.00");
    expect(screen.getByText("Portfolio card: Charizard")).toBeVisible();
    expect(screen.queryByText(/^Loading (collection|watchlist)$/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Set quantity to three" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
    expect(screen.getByText("Your watchlist is empty")).toBeVisible();
    expect(screen.queryByText(/^Loading (collection|watchlist)$/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Collection" }));
    await waitFor(() =>
      expect(
        screen.getByText("Collection value").closest("article"),
      ).toHaveTextContent("$300.00"),
    );
    // Flush the page's scheduled load effect to catch accidental switch refetches.
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
    expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(1);
  });

  test("keeps switching available for empty lists and loads sealed watchlist items", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [],
      entries: [],
      missingItems: [],
    });
    mocks.getHydratedWatchlist.mockResolvedValue({
      items: [
        {
          id: "box-1",
          type: "sealed",
          name: "Booster Box",
          setName: "Base",
          productFamily: "booster_box",
          price: 150,
          priceSnapshots: { "7d": 100 },
        },
      ],
      entries: [{ id: "box-1", type: "sealed" }],
      missingItems: [],
    });
    renderPortfolio();
    await screen.findByText("Your collection is empty");
    fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
    expect(
      await screen.findByText("Watchlist sealed: Booster Box"),
    ).toBeVisible();
    expect(
      screen.getByText("Watchlist value").closest("article"),
    ).toHaveTextContent("$150.00");
    expect(screen.getByText("Assets").closest("article")).toHaveTextContent(
      "1 sealed",
    );
  });

  test("only reports distinct items missing prices, regardless of collection quantity", async () => {
    mocks.auth.user = { uid: "user-1" };
    const card = collectionCard();
    card.quantity = 12;
    card.pokeTrace.prices = {};
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [card],
      entries: [{ id: card.id, type: "single", quantity: 12 }],
      missingItems: [],
    });
    renderPortfolio();
    expect(await screen.findByText("1 item has no price data")).toBeVisible();
    expect(screen.queryByText(/12 items have no price data/)).toBeNull();
  });

  test("updates the watchlist from search without refetching either list", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [],
      entries: [],
      missingItems: [],
    });
    mocks.getHydratedWatchlist.mockResolvedValue({
      items: [],
      entries: [],
      missingItems: [],
    });
    renderPortfolio();
    await screen.findByText("Your collection is empty");
    fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
    await screen.findByText("Your watchlist is empty");
    fireEvent.click(screen.getByRole("button", { name: "Add singles" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Watch search result" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close card search" }));
    expect(await screen.findByText("Watchlist card: Blastoise")).toBeVisible();
    expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(1);
    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
  });
  test("updates the cached watchlist after saving a collection card without fetching", async () => {
    mocks.auth.user = { uid: "user-1" };
    const card = collectionCard();
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [card],
      entries: [{ id: card.id, type: "single", quantity: 2 }],
      missingItems: [],
    });
    renderPortfolio();
    await screen.findByText("Portfolio card: Charizard");
    fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
    await screen.findByText("Your watchlist is empty");
    fireEvent.click(screen.getByRole("radio", { name: "Collection" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Watch collection card" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
    expect(await screen.findByText("Watchlist card: Charizard")).toBeVisible();
    expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(1);
    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
  });

  test("fetches both lists in parallel on entry and caches them before the first switch", async () => {
    mocks.auth.user = { uid: "user-1" };
    type Response = {
      items: PortfolioSingle[];
      entries: { id: string; type: "single"; quantity: number }[];
      missingItems: [];
    };
    let resolveCollection!: (response: Response) => void;
    let resolveWatchlist!: (response: Response) => void;
    mocks.getHydratedPortfolio.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCollection = resolve;
        }),
    );
    mocks.getHydratedWatchlist.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWatchlist = resolve;
        }),
    );
    renderPortfolio();
    await waitFor(() => {
      expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
      expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      resolveCollection({
        items: [collectionCard()],
        entries: [{ id: "base-4", type: "single", quantity: 2 }],
        missingItems: [],
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading collection");
    await act(async () => {
      resolveWatchlist({ items: [], entries: [], missingItems: [] });
    });
    expect(screen.getByText("Portfolio card: Charizard")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
    expect(screen.getByText("Your watchlist is empty")).toBeVisible();
    expect(screen.queryByText(/^Loading (collection|watchlist)$/)).toBeNull();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
    expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(1);
  });

  test("a failed watchlist preload leaves collection usable and retries only watchlist", async () => {
    mocks.auth.user = { uid: "user-1" };
    const empty = { items: [], entries: [], missingItems: [] };
    mocks.getHydratedPortfolio.mockResolvedValue(empty);
    mocks.getHydratedWatchlist
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(empty);
    renderPortfolio();
    expect(await screen.findByText("Your collection is empty")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
    expect(await screen.findByText("Your watchlist is empty")).toBeVisible();
    expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(2);
    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
  });
  for (const list of ["collection", "watchlist"] as const) {
    test(`${list} waits for a save response even when search is closed first`, async () => {
      mocks.auth.user = { uid: "user-1" };
      mocks.getHydratedPortfolio.mockResolvedValue({
        items: [],
        entries: [],
        missingItems: [],
      });
      let finish!: (value: unknown) => void;
      const add =
        list === "collection" ? mocks.addPortfolio : mocks.addWatchlist;
      add.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      renderPortfolio();
      await screen.findByText("Your collection is empty");
      if (list === "watchlist")
        fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
      fireEvent.click(screen.getByRole("button", { name: "Add singles" }));
      fireEvent.click(
        screen.getByRole("button", {
          name:
            list === "collection"
              ? "Save search result"
              : "Watch search result",
        }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Close card search" }),
      );
      expect(screen.getByText(`Your ${list} is empty`)).toBeVisible();
      await act(async () => {
        finish({
          created: true,
          entry: {
            id: "base-2",
            type: "single",
            ...(list === "collection" ? { quantity: 4 } : {}),
          },
        });
      });
      expect(
        screen.getByText(
          `${list === "collection" ? "Portfolio" : "Watchlist"} card: Blastoise`,
        ),
      ).toBeVisible();
      expect(
        screen
          .getByText(
            list === "collection" ? "Collection value" : "Watchlist value",
          )
          .closest("article"),
      ).toHaveTextContent(list === "collection" ? "$400.00" : "$100.00");
      fireEvent.click(
        screen.getByRole("radio", {
          name: list === "collection" ? "Watchlist" : "Collection",
        }),
      );
      fireEvent.click(
        screen.getByRole("radio", {
          name: list === "collection" ? "Collection" : "Watchlist",
        }),
      );
      expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
      expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(1);
    });

    test(`${list} keeps a saved item until removal succeeds and leaves failed removals unchanged`, async () => {
      mocks.auth.user = { uid: "user-1" };
      const snapshot = {
        items: [collectionCard()],
        entries: [{ id: "base-4", type: "single", quantity: 2 }],
        missingItems: [],
      };
      mocks.getHydratedPortfolio.mockResolvedValue(snapshot);
      mocks.getHydratedWatchlist.mockResolvedValue(snapshot);
      let finish!: () => void;
      const remove =
        list === "collection" ? mocks.removePortfolio : mocks.removeWatchlist;
      remove.mockRejectedValueOnce(new Error("Offline")).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      renderPortfolio();
      await screen.findByText("Portfolio card: Charizard");
      if (list === "watchlist")
        fireEvent.click(screen.getByRole("radio", { name: "Watchlist" }));
      const name =
        list === "collection" ? "Remove collected card" : "Remove watched card";
      fireEvent.click(screen.getByRole("button", { name }));
      await screen.findByRole("alert");
      expect(
        screen.getByText(
          `${list === "collection" ? "Portfolio" : "Watchlist"} card: Charizard`,
        ),
      ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name }));
      expect(
        screen.getByText(
          `${list === "collection" ? "Portfolio" : "Watchlist"} card: Charizard`,
        ),
      ).toBeVisible();
      await act(async () => finish());
      expect(screen.getByText(`Your ${list} is empty`)).toBeVisible();
      expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
      expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(1);
    });
  }

  test("quantity changes use the server response and leave failures unchanged", async () => {
    mocks.auth.user = { uid: "user-1" };
    mocks.getHydratedPortfolio.mockResolvedValue({
      items: [collectionCard()],
      entries: [{ id: "base-4", type: "single", quantity: 2 }],
      missingItems: [],
    });
    let finish!: (value: unknown) => void;
    mocks.updateQuantity
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("Offline"));
    renderPortfolio();
    await screen.findByText("Portfolio card: Charizard");
    fireEvent.click(
      screen.getByRole("button", { name: "Set quantity to three" }),
    );
    expect(
      screen.getByText("Collection value").closest("article"),
    ).toHaveTextContent("$200.00");
    await act(async () =>
      finish({ id: "base-4", type: "single", quantity: 5 }),
    );
    expect(
      screen.getByText("Collection value").closest("article"),
    ).toHaveTextContent("$500.00");
    fireEvent.click(
      screen.getByRole("button", { name: "Set quantity to three" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.getByText("Collection value").closest("article"),
    ).toHaveTextContent("$500.00");
    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
  });

  test("reopening portfolio fetches both lists again even when their caches are populated", async () => {
    mocks.auth.user = { uid: "user-1" };
    const empty = { items: [], entries: [], missingItems: [] };
    mocks.getHydratedPortfolio
      .mockResolvedValueOnce({
        items: [collectionCard()],
        entries: [{ id: "base-4", type: "single", quantity: 2 }],
        missingItems: [],
      })
      .mockResolvedValueOnce(empty);
    const view = renderPortfolio();
    await screen.findByText("Portfolio card: Charizard");
    view.rerender(
      <Providers>
        <div>Another page</div>
      </Providers>,
    );
    view.rerender(
      <Providers>
        <Portfolio />
      </Providers>,
    );
    expect(screen.getByText("Loading collection")).toBeVisible();
    expect(await screen.findByText("Your collection is empty")).toBeVisible();
    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(2);
    expect(mocks.getHydratedWatchlist).toHaveBeenCalledTimes(2);
  });
});
