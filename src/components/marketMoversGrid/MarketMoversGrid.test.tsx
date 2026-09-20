import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MarketMoversGrid } from "./MarketMoversGrid";

vi.mock("../cardCategoryGrid/CardCategoryGrid", () => ({
  CardCategoryGrid: ({
    items,
    loading,
  }: {
    items: Array<{
      card: { name: string };
      marketDisplay?: { marketLabel?: string; price: number };
    }>;
    loading: boolean;
  }) => (
    <div aria-label="Mover grid" data-loading={loading}>
      {items.map((item) => (
        <span key={item.card.name}>
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
        price7dAvg: 100,
        rarity: "Holo Rare",
        saleCount: 12,
        set: { name: "Base Set", slug: "base-set" },
        source: "tcgplayer",
        tier: "NEAR_MINT",
        variant: "Holofoil",
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
  expect(loadMovers).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(screen.getByText(/Charizard NM.*TCGPlayer 120/)).toBeVisible();
});
