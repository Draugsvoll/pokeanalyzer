import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { MarketMoversResponse } from "../../../shared/marketMovers";
import type { PokemonCardViewProps } from "../pokemonCardView/PokemonCardView";
import { MarketMoversGrid } from "./MarketMoversGrid";

// Keep the category, grid, and image-loading helper real. Only the leaf card's
// portfolio/auth dependencies are outside the scope of these loading tests.
vi.mock("../pokemonCardView/PokemonCardView", () => ({
  PokemonCardView: ({ card }: PokemonCardViewProps) => (
    <article>{card.name}</article>
  ),
}));

class ControlledImage {
  static instances: ControlledImage[] = [];
  complete = false;
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    ControlledImage.instances.push(this);
  }
}

function response(names = ["Charizard", "Blastoise"]): MarketMoversResponse {
  return {
    fetchedAt: "2026-10-13T00:00:00Z",
    periodDays: 1,
    query: {
      direction: "gainers",
      game: "pokemon",
      limit: names.length,
      market: "US",
    },
    stale: false,
    items: names.map((name) => ({
      approxSaleCount: false,
      cardId: name,
      cardNumber: null,
      changeAbs: 10,
      changePct: 10,
      currency: "USD",
      currentPrice: 110,
      game: "pokemon",
      image: `https://example.com/${name}.webp`,
      name,
      previousPrice: 100,
      rarity: null,
      saleCount: 200,
      set: { name: "Base Set", slug: "base-set" },
      source: "tcgplayer",
      tier: "NEAR_MINT",
      variant: null,
    })),
  };
}

beforeEach(() => {
  ControlledImage.instances = [];
  vi.stubGlobal("Image", ControlledImage);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function expectGridSpinner() {
  const loading = screen.getByRole("status", { name: "Loading card category" });
  expect(loading).toBeVisible();
  expect(loading.querySelectorAll(".app-loading-spinner")).toHaveLength(1);
  expect(screen.queryAllByRole("article")).toHaveLength(0);
}

test.each(["load", "error"] as const)(
  "keeps one spinner through data and image loading, then renders cards after the last image's %s",
  async (lastEvent) => {
    let resolveData!: (value: MarketMoversResponse) => void;
    const loadMovers = vi.fn(
      () =>
        new Promise<MarketMoversResponse>((resolve) => {
          resolveData = resolve;
        }),
    );
    render(
      <MarketMoversGrid
        minimized
        waitForImages
        loadMovers={loadMovers}
        title="TCG Daily Gainers"
      />,
    );
    expectGridSpinner();
    expect(ControlledImage.instances).toHaveLength(0);

    await act(async () => {
      resolveData(response());
    });
    expect(ControlledImage.instances.map(({ src }) => src)).toEqual([
      "https://example.com/Charizard.webp",
      "https://example.com/Blastoise.webp",
    ]);
    expectGridSpinner();
    await act(async () => {
      ControlledImage.instances[0].onload?.();
    });
    expectGridSpinner();
    await act(async () => {
      if (lastEvent === "load") ControlledImage.instances[1].onload?.();
      else ControlledImage.instances[1].onerror?.();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("article").map((card) => card.textContent),
    ).toEqual(["Charizard", "Blastoise"]);
  },
);

test("releases the grid spinner when image loading times out", async () => {
  vi.useFakeTimers();
  const loadMovers = vi.fn().mockResolvedValue(response());
  await act(async () => {
    render(
      <MarketMoversGrid
        minimized
        waitForImages
        loadMovers={loadMovers}
        title="TCG Daily Gainers"
      />,
    );
  });
  expect(ControlledImage.instances).toHaveLength(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9_999);
  });
  expectGridSpinner();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(2);
});

test("navigation aborts pending images and late callbacks cannot populate the next grid", async () => {
  vi.useFakeTimers();
  const loadMovers = vi
    .fn<(signal?: AbortSignal) => Promise<MarketMoversResponse>>()
    .mockResolvedValueOnce(response(["Old card"]))
    .mockResolvedValueOnce(response(["New card"]));
  await act(async () => {
    render(
      <MemoryRouter>
        <Link to="/away">Leave grid</Link>
        <Link to="/">Return to grid</Link>
        <Routes>
          <Route
            path="/"
            element={
              <MarketMoversGrid
                minimized
                waitForImages
                loadMovers={loadMovers}
                title="TCG Daily Gainers"
              />
            }
          />
          <Route path="/away" element={<p>Another page</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  expectGridSpinner();
  const oldImage = ControlledImage.instances[0];
  const lateLoad = oldImage.onload;
  await act(async () => {
    fireEvent.click(screen.getByText("Leave grid"));
  });
  expect(loadMovers.mock.calls[0][0]?.aborted).toBe(true);
  expect(oldImage.onload).toBeNull();
  expect(oldImage.onerror).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  expect(screen.getByText("Another page")).toBeVisible();

  await act(async () => {
    fireEvent.click(screen.getByText("Return to grid"));
  });
  expect(ControlledImage.instances).toHaveLength(2);
  await act(async () => {
    lateLoad?.();
  });
  expectGridSpinner();
  expect(screen.queryByText("Old card")).not.toBeInTheDocument();
  await act(async () => {
    ControlledImage.instances[1].onload?.();
  });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("article")).toHaveTextContent("New card");
  expect(screen.queryByText("Old card")).not.toBeInTheDocument();
});
