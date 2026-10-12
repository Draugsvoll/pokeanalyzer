import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MostSoldGrid } from "./MostSoldGrid";

vi.mock("../../services/marketCategoriesApi", () => ({
  mostSoldCards: vi.fn().mockResolvedValue({
    comparisonSnapshotDate: "2026-09-21",
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
    periodDays: 1,
    source: "tcgplayer",
  }),
}));

vi.mock("../cardCategoryGrid/CardCategoryGrid", () => ({
  CardCategoryGrid: ({
    error,
    items,
    loading,
    onRetry,
  }: {
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
        source?: string;
      };
    }>;
    loading: boolean;
    onRetry?: () => void;
  }) => (
    <div aria-label="Most sold grid" data-loading={loading}>
      {error && <span>{error}</span>}
      {onRetry && <button onClick={onRetry}>Try again</button>}
      {items.map((item) => (
        <span key={item.card.name}>
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
    });

  render(<MostSoldGrid loadCards={loadCards} />);

  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

  await waitFor(() => expect(loadCards).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull(),
  );
});
