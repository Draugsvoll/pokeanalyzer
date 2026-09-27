import { render, screen, waitFor } from "@testing-library/react";
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
    items,
    loading,
  }: {
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
  }) => (
    <div aria-label="Most sold grid" data-loading={loading}>
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

test("renders the current price with the number of new sales", async () => {
  render(<MostSoldGrid />);

  await waitFor(() =>
    expect(screen.getByLabelText("Most sold grid")).toHaveAttribute(
      "data-loading",
      "false",
    ),
  );
  expect(
    screen.getByText(
      /Charizard Unknown set 120 20 new sales NEAR_MINT tcgplayer 100/,
    ),
  ).toBeVisible();
});
