import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PortfolioSingle } from "../../types/portfolio";
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

vi.mock("../../components/databaseSearch/DatabaseSearch", () => ({
  DatabaseSearch: ({
    initialProductType,
    onPortfolioChanged,
  }: {
    initialProductType?: "singles" | "sealed";
    onPortfolioChanged?: (saved: boolean) => void;
  }) => (
    <>
      <output aria-label="Initial product type">{initialProductType}</output>
      <button onClick={() => onPortfolioChanged?.(true)} type="button">
        Save search result
      </button>
    </>
  ),
}));

vi.mock("../../components/pokemonCardView/PokemonCardView", () => ({
  PokemonCardPortfolioView: ({ card }: { card: PortfolioSingle }) => (
    <div>Portfolio card: {card.name}</div>
  ),
}));

vi.mock("../../components/sealedProductView/SealedProductView", () => ({
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
      items: [collectionCard()],
      entries: [{ id: "base-4", type: "single", quantity: 2 }],
      missingItems: [],
    });

    renderPortfolio();

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
    expect(bestPerformerMetric).toHaveTextContent("$200.0025.0%7d");
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
    expect(mocks.replacePortfolioReferences).toHaveBeenCalledWith([
      { id: "base-4", type: "single", quantity: 2 },
    ]);
  });

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

    const assetsMetric = (await screen.findByText("Assets")).closest("article");
    expect(assetsMetric).toHaveTextContent("5");
    expect(assetsMetric).toHaveTextContent("2 singles");
    expect(assetsMetric).toHaveTextContent("3 sealed");
    expect(
      screen.getByText("Portfolio sealed: Base Set Booster Box"),
    ).toBeVisible();
  });

  test("refreshes the portfolio after an embedded search changes it", async () => {
    mocks.auth.user = { uid: "user-1" };
    const addedCard = {
      ...collectionCard(),
      id: "base-2",
      name: "Blastoise",
      number: "2/102",
      quantity: 1,
    };
    mocks.getHydratedPortfolio
      .mockResolvedValueOnce({
        items: [collectionCard()],
        entries: [{ id: "base-4", type: "single", quantity: 2 }],
        missingItems: [],
      })
      .mockResolvedValueOnce({
        items: [collectionCard(), addedCard],
        entries: [
          { id: "base-4", type: "single", quantity: 2 },
          { id: "base-2", type: "single", quantity: 1 },
        ],
        missingItems: [],
      });

    renderPortfolio();
    const trigger = await screen.findByRole("button", { name: "Add singles" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Save search result" }));

    expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close card search" }));

    await waitFor(() =>
      expect(mocks.getHydratedPortfolio).toHaveBeenCalledTimes(2),
    );
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
    await screen.findByText("Best performer");

    const bestPerformer = screen
      .getByText("Best performer")
      .closest("article");
    const weakestPerformer = screen
      .getByText("Worst performer")
      .closest("article");
    expect(bestPerformer).toHaveTextContent("Blastoise");
    expect(weakestPerformer).toHaveTextContent("Charizard");
    expect(
      bestPerformer!.querySelector(".app-price-change__period"),
    ).toHaveTextContent("7d");

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

  test("uses a contained empty state without the collection header", async () => {
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
    expect(screen.queryByRole("heading", { name: "My collection" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add singles" })).toBeVisible();
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
});
