import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MarketMoversGrid } from "./MarketMoversGrid";

vi.mock("../cardCategoryGrid/CardCategoryGrid", () => ({
  CardCategoryGrid: ({
    items,
    loading,
  }: {
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
  }) => (
    <div aria-label="Mover grid" data-loading={loading}>
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
