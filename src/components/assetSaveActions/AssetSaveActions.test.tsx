import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { PortfolioProvider } from "../../context/PortfolioCacheContext";
import { WatchlistProvider } from "../../context/WatchlistCacheContext";
import { NotificationProvider } from "../../context/NotificationContext";
import {
  PokemonCardView,
  PokemonCardPortfolioView,
} from "../pokemonCardView/PokemonCardView";
import {
  SealedProductView,
  SealedProductPortfolioView,
} from "../sealedProductView/SealedProductView";
import { AssetSaveActions } from "./AssetSaveActions";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { useSealedPortfolio } from "../../hooks/sealedPortfolio";
import { useWatchlist } from "../../hooks/useWatchlist";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import type {
  PortfolioSingle,
  PortfolioSealedProduct,
} from "../../types/portfolio";

const mocks = vi.hoisted(() => ({
  addWatchlist: vi.fn(),
  removeWatchlist: vi.fn(),
  addPortfolio: vi.fn(),
  removePortfolio: vi.fn(),
  updateQuantity: vi.fn(),
}));
vi.mock("../../context/authContextValue", () => ({
  useAuth: () => ({ user: { uid: "user-1" } }),
}));
vi.mock("../../services/watchlistApi", () => ({
  getWatchlistReferences: async () => ({ entries: [] }),
  addWatchlistItem: mocks.addWatchlist,
  removeWatchlistItem: mocks.removeWatchlist,
}));
vi.mock("../../services/portfolioApi", () => ({
  getPortfolioReferences: async () => ({ entries: [] }),
  addPortfolioCard: (id: string, uid: string) =>
    mocks.addPortfolio("single", id, uid),
  removePortfolioCard: (id: string, uid: string) =>
    mocks.removePortfolio("single", id, uid),
  addPortfolioItem: mocks.addPortfolio,
  removePortfolioItem: mocks.removePortfolio,
  updatePortfolioCardQuantity: (id: string, quantity: number, uid: string) =>
    mocks.updateQuantity("single", id, quantity, uid),
  updatePortfolioItemQuantity: mocks.updateQuantity,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addWatchlist.mockImplementation(async (type, id) => ({
    created: true,
    entry: { type, id },
  }));
  mocks.removeWatchlist.mockResolvedValue(undefined);
  mocks.addPortfolio.mockImplementation(async (type, id) => ({
    created: true,
    entry: { type, id, quantity: 1 },
  }));
  mocks.removePortfolio.mockResolvedValue(undefined);
  mocks.updateQuantity.mockReset();
});

const single: PortfolioSingle = {
  id: "shared-item",
  type: "single",
  name: "Pikachu",
  quantity: 2,
  set: { id: "base", name: "Base" },
  pokeTrace: { currency: "USD", prices: {}, marketplaceUrls: {} },
};
const sealed: PortfolioSealedProduct = {
  id: "shared-item",
  type: "sealed",
  name: "Booster Box",
  quantity: 2,
  setName: "Base",
  productFamily: "booster_box",
  currency: "USD",
  price: 100,
  priceSnapshots: { "1d": null, "7d": 80, "30d": null },
};

for (const type of ["single", "sealed"] as const) {
  test(`${type} quantity updates block competing saves/removals across hook instances`, async () => {
    const { result } = renderHook(
      () => ({
        singles: usePokemonPortfolio(),
        otherSingles: usePokemonPortfolio(),
        sealed: useSealedPortfolio(),
        otherSealed: useSealedPortfolio(),
        watchlist: useWatchlist(),
        cache: usePortfolioCache(),
      }),
      { wrapper: Providers },
    );
    await waitFor(() =>
      expect(result.current.cache.loadingPortfolioReferences).toBe(false),
    );
    const item = type === "single" ? single : sealed;
    await act(async () => {
      await result.current.cache.hydrate(
        async () => ({ entries: [item], items: [item] }),
        new AbortController().signal,
      );
    });
    const confirmation = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    try {
      await act(async () => {
        expect(
          await (type === "single"
            ? result.current.singles.removePokemonFromPortfolio(item.id)
            : result.current.sealed.removeSealedFromPortfolio(item.id)),
        ).toBe(false);
      });
    } finally {
      confirmation.mockRestore();
    }
    expect(result.current.cache.isItemUpdating(type, item.id)).toBe(false);
    expect(mocks.removePortfolio).not.toHaveBeenCalled();
    let finish!: (entry: unknown) => void;
    mocks.updateQuantity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let pending!: Promise<boolean>;
    act(() => {
      pending =
        type === "single"
          ? result.current.singles.updatePokemonQuantity(item.id, 3)
          : result.current.sealed.updateSealedQuantity(item.id, 3);
    });
    expect(result.current.cache.isItemUpdating(type, item.id)).toBe(true);
    expect(result.current.cache.items[0].quantity).toBe(2);
    await act(async () => {
      expect(
        await (type === "single"
          ? result.current.otherSingles.removePokemonFromPortfolio(
              item.id,
              false,
            )
          : result.current.otherSealed.removeSealedFromPortfolio(
              item.id,
              false,
            )),
      ).toBe(false);
      expect(
        await (type === "single"
          ? result.current.otherSingles.savePokemonToPortfolio(single)
          : result.current.otherSealed.saveSealedToPortfolio(sealed)),
      ).toBe(false);
      expect(
        await (type === "single"
          ? result.current.otherSingles.updatePokemonQuantity(item.id, 4)
          : result.current.otherSealed.updateSealedQuantity(item.id, 4)),
      ).toBe(false);
      expect(await result.current.watchlist.setWatched(item, true)).toBe(true);
    });
    expect(mocks.removePortfolio).not.toHaveBeenCalled();
    expect(mocks.addPortfolio).not.toHaveBeenCalled();
    expect(mocks.updateQuantity).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ id: item.id, type, quantity: 3 });
      expect(await pending).toBe(true);
    });
    expect(result.current.cache.items[0].quantity).toBe(3);
    await act(async () => {
      expect(
        await (type === "single"
          ? result.current.otherSingles.removePokemonFromPortfolio(
              item.id,
              false,
            )
          : result.current.otherSealed.removeSealedFromPortfolio(
              item.id,
              false,
            )),
      ).toBe(true);
    });
    expect(mocks.removePortfolio).toHaveBeenCalledTimes(1);
    expect(result.current.cache.isItemSaved(type, item.id)).toBe(false);
    expect(result.current.cache.items).toEqual([]);
    expect(result.current.cache.missingItems).toEqual([]);
  });

  test(`${type} quantity controls and duplicate portfolio buttons share busy state`, async () => {
    let finish!: (entry: unknown) => void;
    mocks.updateQuantity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view =
      type === "single" ? (
        <PokemonCardPortfolioView card={single} />
      ) : (
        <SealedProductPortfolioView product={sealed} comparisonPeriod="7d" />
      );
    render(
      <Providers>
        <section aria-label="First card">{view}</section>
        <section aria-label="Duplicate card">{view}</section>
      </Providers>,
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Add to portfolio" })[0],
      ).toBeEnabled(),
    );
    const first = within(screen.getByRole("region", { name: "First card" }));
    const name = type === "single" ? single.name : sealed.name;
    fireEvent.click(
      first.getByRole("button", { name: `Increase ${name} quantity` }),
    );
    fireEvent.click(
      first.getByRole("button", { name: "Apply quantity change" }),
    );
    expect(
      screen.getAllByRole("button", { name: "Updating portfolio" }),
    ).toHaveLength(2);
    for (const button of screen.getAllByRole("button", {
      name: "Updating portfolio",
    }))
      expect(button).toBeDisabled();
    for (const button of screen.getAllByRole("button", {
      name: `Increase ${name} quantity`,
    }))
      expect(button).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: "Add to watchlist" })[0],
    ).toBeEnabled();
    await act(async () => {
      finish({ id: single.id, type, quantity: 3 });
    });
    for (const button of screen.getAllByRole("button", {
      name: `Increase ${name} quantity`,
    }))
      expect(button).toBeEnabled();
  });
}

test("watchlist guards apply across instances and release after a failed request", async () => {
  const { result } = renderHook(
    () => ({ first: useWatchlist(), second: useWatchlist() }),
    { wrapper: Providers },
  );
  let reject!: (error: Error) => void;
  mocks.addWatchlist.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.first.setWatched(single, true);
  });
  await act(async () => {
    expect(await result.current.second.setWatched(single, false)).toBe(false);
    expect(await result.current.second.setWatched(single, true)).toBe(false);
  });
  expect(mocks.addWatchlist).toHaveBeenCalledTimes(1);
  expect(mocks.removeWatchlist).not.toHaveBeenCalled();
  await act(async () => {
    reject(new Error("Offline"));
    expect(await pending).toBe(false);
  });
  await act(async () => {
    expect(await result.current.second.setWatched(single, true)).toBe(true);
  });
  expect(mocks.addWatchlist).toHaveBeenCalledTimes(2);
});

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <NotificationProvider>
        <PortfolioProvider>
          <WatchlistProvider>{children}</WatchlistProvider>
        </PortfolioProvider>
      </NotificationProvider>
    </MemoryRouter>
  );
}

for (const type of ["single", "sealed"] as const) {
  test(`${type} tiles save independently to both lists and announce only successful updates`, async () => {
    const view =
      type === "single" ? (
        <PokemonCardView
          card={{
            id: "item-1",
            name: "Pikachu",
            set: { id: "base", name: "Base Set" },
            pokeTrace: { currency: "USD", marketplaceUrls: {}, prices: {} },
          }}
        />
      ) : (
        <SealedProductView
          product={{
            id: "item-1",
            name: "Booster Box",
            productFamily: "booster_box",
            setName: "Base",
            price: 100,
            currency: "USD",
            priceSnapshots: { "1d": null, "7d": 80, "30d": null },
          }}
        />
      );
    render(<Providers>{view}</Providers>);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add to watchlist" }),
      ).toBeEnabled(),
    );
    const watchButton = screen.getByRole("button", {
      name: "Add to watchlist",
    });
    expect(watchButton.querySelector(".lucide-heart")).not.toBeNull();
    const portfolioButton = screen.getByRole("button", {
      name: "Add to portfolio",
    });
    expect(portfolioButton.querySelector(".lucide-star")).not.toBeNull();
    expect(
      Array.from(watchButton.parentElement!.querySelectorAll("button")),
    ).toEqual([watchButton, portfolioButton]);
    fireEvent.click(watchButton);
    expect(await screen.findByText("Added to watchlist")).toBeVisible();
    expect(mocks.addWatchlist).toHaveBeenCalledWith(type, "item-1", "user-1");
    expect(mocks.addPortfolio).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Remove from watchlist" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(portfolioButton);
    expect(await screen.findByText("Added to portfolio")).toBeVisible();
    expect(mocks.addPortfolio).toHaveBeenCalledWith(type, "item-1", "user-1");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove from watchlist" }),
    );
    expect(await screen.findByText("Removed from watchlist")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove from portfolio" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mocks.removePortfolio).not.toHaveBeenCalled();
    mocks.addWatchlist.mockRejectedValueOnce(new Error("Offline"));
    fireEvent.click(screen.getByRole("button", { name: "Add to watchlist" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't update your watchlist",
    );
    expect(
      screen.getByRole("button", { name: "Add to watchlist" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
}

test("detail actions retain their labels and prevent repeated writes while saving", async () => {
  let finish!: (result: unknown) => void;
  mocks.addWatchlist.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <Providers>
      <AssetSaveActions
        item={{
          id: "card-1",
          type: "single",
          name: "Pikachu",
          set: { id: "base", name: "Base" },
          pokeTrace: { currency: "USD", marketplaceUrls: {}, prices: {} },
        }}
        layout="detail"
        portfolio={{
          saved: true,
          busy: false,
          unavailable: false,
          onToggle: vi.fn(),
        }}
      />
    </Providers>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Add to watchlist" }),
    ).toBeEnabled(),
  );
  const watchButton = screen.getByRole("button", { name: "Add to watchlist" });
  expect(
    Array.from(watchButton.parentElement!.querySelectorAll("button")),
  ).toEqual([
    screen.getByRole("button", {
      name: "In portfolio, Remove from portfolio",
    }),
    watchButton,
  ]);
  fireEvent.click(watchButton);
  const pending = screen.getByRole("button", { name: "Updating watchlist" });
  expect(pending).toBeDisabled();
  expect(pending).toHaveTextContent("Watchlist");
  fireEvent.click(pending);
  expect(mocks.addWatchlist).toHaveBeenCalledTimes(1);
  finish({ created: true, entry: { id: "card-1", type: "single" } });
  expect(await screen.findByText("Added to watchlist")).toBeVisible();
  expect(
    screen.getByRole("button", {
      name: "In watchlist, Remove from watchlist",
    }),
  ).toHaveTextContent("In watchlist");
});
