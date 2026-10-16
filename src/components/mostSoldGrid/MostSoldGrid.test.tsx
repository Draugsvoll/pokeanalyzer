import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MostSoldGrid } from "./MostSoldGrid";

vi.mock("../../services/marketCategoriesApi", () => ({
  mostSoldCards: vi.fn().mockResolvedValue({
    comparisonSnapshotDate: "2026-09-18",
    condition: "ALL",
    currentSnapshotDate: "2026-09-22",
    fetchedAt: "2026-09-22T12:00:00.000Z",
    items: [
      {
        cardId: "card-1",
        cardNumber: "4/102",
        currency: "USD",
        currentPrice: 120,
        image: null,
        name: "Charizard",
        newSales: 20,
        priceSnapshots: { "1d": 115, "7d": 100, "30d": 90 },
        prices: { NEAR_MINT: { avg: 120, saleCount: 50 } },
        rarity: "Holo Rare",
        setName: null,
        variant: "Holofoil",
      },
    ],
    periodDays: 4,
    source: "tcgplayer",
    status: "ready",
  }),
}));

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
          marketPriceSnapshots?: Record<"1d" | "7d" | "30d", number | null>;
        };
        set: { name: string };
      };
      marketDisplay?: {
        condition?: string;
        marketLabel?: string;
        price?: number;
        priceLabel?: string;
        source?: string;
      };
    }>;
    loading: boolean;
    onRetry?: () => void;
  }) => (
    <div aria-label="Most sold grid" data-loading={loading}>
      {error && <span role="alert">{error}</span>}
      {!loading && !error && items.length === 0 && <span>{emptyMessage}</span>}
      {onRetry && <button onClick={onRetry}>Try again</button>}
      {items.map((item) => (
        <span key={item.card.name} title={item.marketDisplay?.priceLabel}>
          {item.card.name} {item.card.set.name} {item.marketDisplay?.price}{" "}
          {item.marketDisplay?.marketLabel} {item.marketDisplay?.condition}{" "}
          {item.marketDisplay?.source}{" "}
          {item.card.pokeTrace.marketPriceSnapshots?.["7d"]}
        </span>
      ))}
    </div>
  ),
}));

test("renders the current price without a visible sales label", async () => {
  render(<MostSoldGrid />);

  await waitFor(() =>
    expect(screen.getByLabelText("Most sold grid")).toHaveAttribute(
      "data-loading",
      "false",
    ),
  );
  expect(
    screen.getByText(/Charizard Unknown set 120\s+NEAR_MINT tcgplayer 100/),
  ).toBeVisible();
  expect(screen.queryByText("20 new sales")).toBeNull();
  expect(
    screen.getByTitle(
      "20 new sales on TCGPlayer across all stored conditions from 2026-09-18 to 2026-09-22",
    ),
  ).toBeVisible();
});

test("retries a failed most-sold request", async () => {
  const loadCards = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      comparisonSnapshotDate: "2026-09-21",
      condition: "ALL",
      currentSnapshotDate: "2026-09-22",
      fetchedAt: "2026-09-22T12:00:00.000Z",
      items: [],
      periodDays: 1,
      source: "tcgplayer",
      status: "ready",
    });

  render(<MostSoldGrid loadCards={loadCards} />);

  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

  await waitFor(() => expect(loadCards).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
  );
});

test.each([
  [
    "insufficient_history",
    "This ranking is temporarily unavailable. Please check back later.",
  ],
  ["ready", "No cards currently meet the sales trend criteria."],
])("shows %s as an empty state without retry", async (status, message) => {
  const loadCards = vi.fn().mockResolvedValue({
    comparisonSnapshotDate: null,
    condition: "ALL",
    currentSnapshotDate: null,
    fetchedAt: "2026-09-22T12:00:00.000Z",
    items: [],
    periodDays: 1,
    source: "tcgplayer",
    status,
  });

  render(<MostSoldGrid loadCards={loadCards} />);

  expect(await screen.findByText(message)).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(loadCards).toHaveBeenCalledTimes(1);
});
