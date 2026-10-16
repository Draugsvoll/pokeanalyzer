import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MarketMoversGrid } from "./MarketMoversGrid";

vi.mock("../cardCategoryGrid/CardCategoryGrid", () => ({
  CardCategoryGrid: ({
    emptyMessage,
    error,
    items,
    loading,
    onRetry,
  }: {
    emptyMessage?: string;
    error?: string | null;
    items: Array<{
      card: {
        name: string;
        pokeTrace: {
          prices: Record<string, Record<string, { avg?: number }>>;
        };
      };
      marketDisplay?: {
        changePeriod?: string;
        marketLabel?: string;
        price: number;
      };
    }>;
    loading: boolean;
    onRetry?: () => void;
  }) => (
    <div aria-label="Mover grid" data-loading={loading}>
      {error && <span role="alert">{error}</span>}
      {!loading && !error && items.length === 0 && <span>{emptyMessage}</span>}
      {onRetry && <button onClick={onRetry}>Try again</button>}
      {items.map((item) => (
        <span
          data-preview-price={
            item.card.pokeTrace.prices.tcgplayer?.NEAR_MINT?.avg
          }
          data-price-change-period={item.marketDisplay?.changePeriod}
          key={item.card.name}
        >
          {item.card.name} {item.marketDisplay?.marketLabel}{" "}
          {item.marketDisplay?.price}
        </span>
      ))}
    </div>
  ),
}));

test("loads a configurable mover category and maps it to grid cards", async () => {
  const loadMovers = vi.fn().mockResolvedValue({
    fetchedAt: "2026-09-20T12:00:00.000Z",
    items: [
      {
        approxSaleCount: false,
        cardId: "card-1",
        cardNumber: "4/102",
        changeAbs: 20,
        changePct: 20,
        currency: "USD",
        currentPrice: 120,
        game: "pokemon",
        image: "https://example.com/card.webp",
        name: "Charizard",
        previousPrice: 100,
        rarity: "Holo Rare",
        saleCount: 12,
        set: { name: "Base Set", slug: "base-set" },
        source: "tcgplayer",
        tier: "NEAR_MINT",
        variant: "Holofoil",
      },
    ],
    periodDays: 1,
    query: {},
    stale: false,
  });

  const { rerender } = render(
    <MarketMoversGrid loadMovers={loadMovers} title="Category" />,
  );

  await waitFor(() =>
    expect(screen.getByLabelText("Mover grid")).toHaveAttribute(
      "data-loading",
      "false",
    ),
  );
  expect(loadMovers).toHaveBeenCalledWith(expect.any(AbortSignal));
  const card = screen.getByText(/Charizard NM.*TCG 120/);
  expect(card).toBeVisible();
  expect(card).toHaveAttribute("data-preview-price", "120");
  expect(card).toHaveAttribute("data-price-change-period", "1d");

  rerender(
    <MarketMoversGrid
      loadMovers={loadMovers}
      showMarketLabel={false}
      title="Category"
    />,
  );

  await waitFor(() =>
    expect(screen.queryByText(/NM.*TCG/)).not.toBeInTheDocument(),
  );
});

test("omits the period when the response does not identify its snapshot", async () => {
  const loadMovers = vi.fn().mockResolvedValue({
    fetchedAt: "2026-09-20T12:00:00.000Z",
    items: [
      {
        approxSaleCount: false,
        cardId: "card-1",
        cardNumber: "4/102",
        changeAbs: 20,
        changePct: 20,
        currency: "USD",
        currentPrice: 120,
        game: "pokemon",
        image: null,
        name: "Charizard",
        previousPrice: 100,
        rarity: null,
        saleCount: 12,
        set: { name: "Base Set", slug: "base-set" },
        source: "tcgplayer",
        tier: "NEAR_MINT",
        variant: null,
      },
    ],
    query: {},
    stale: false,
  });

  render(<MarketMoversGrid loadMovers={loadMovers} title="Category" />);

  await waitFor(() =>
    expect(screen.getByLabelText("Mover grid")).toHaveAttribute(
      "data-loading",
      "false",
    ),
  );
  expect(screen.getByText(/Charizard/)).not.toHaveAttribute(
    "data-price-change-period",
  );
});

test("retries a failed market request", async () => {
  const loadMovers = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      fetchedAt: "2026-09-20T12:00:00.000Z",
      items: [],
      periodDays: 1,
      query: {},
      stale: false,
    });

  render(<MarketMoversGrid loadMovers={loadMovers} title="Category" />);

  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

  await waitFor(() => expect(loadMovers).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
  );
});

test("shows missing price history without treating it as a failed request", async () => {
  const loadMovers = vi.fn().mockResolvedValue({
    fetchedAt: "2026-09-20T12:00:00.000Z",
    items: [],
    periodDays: 1,
    query: {},
    stale: false,
    status: "insufficient_history",
  });

  render(<MarketMoversGrid loadMovers={loadMovers} title="Category" />);

  expect(
    await screen.findByText(
      "This ranking is temporarily unavailable. Please check back later.",
    ),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(loadMovers).toHaveBeenCalledTimes(1);
});
