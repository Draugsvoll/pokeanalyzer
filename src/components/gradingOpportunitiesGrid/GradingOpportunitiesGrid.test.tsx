import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { GradingOpportunitiesGrid } from "./GradingOpportunitiesGrid";

vi.mock("../../services/marketCategoriesApi", () => ({
  gradingOpportunities: vi.fn().mockResolvedValue({
    fetchedAt: "2026-11-01T12:00:00.000Z",
    items: [
      {
        cardId: "card-1",
        cardNumber: "11/108",
        currency: "USD",
        image: null,
        multiplier: 143.33,
        name: "Charizard",
        nearMintPrice: 108.975,
        nearMintSales: 161,
        tcgPrices: { NEAR_MINT: { avg: 125 } },
        priceIncrease: 15510.945,
        psaMedian: "7d",
        psaPrice: 15619.92,
        psaSales: 78,
        rarity: "Rare Holo",
        setName: "XY - Evolutions",
        variant: "Holofoil",
      },
    ],
    status: "ready",
  }),
}));

vi.mock("../cardCategoryGrid/CardCategoryGrid", () => ({
  CardCategoryGrid: ({
    emptyMessage,
    items,
    loading,
    title,
  }: {
    emptyMessage?: string;
    items: Array<{
      card: { name: string; pokeTrace: { prices: unknown } };
      badge?: ReactNode;
      marketDisplay?: {
        marketLabel?: string;
        priceLabel?: string;
        primaryText?: string;
      };
    }>;
    loading: boolean;
    title?: string;
  }) => (
    <div aria-label="Grading opportunities" data-loading={loading}>
      <h2>{title}</h2>
      {!loading && items.length === 0 && <span>{emptyMessage}</span>}
      {items.map((item) => (
        <span
          key={item.card.name}
          data-prices={JSON.stringify(item.card.pokeTrace.prices)}
          data-market-override={Boolean(item.marketDisplay)}
        >
          {item.card.name}
          {item.badge}
        </span>
      ))}
    </div>
  ),
}));

test("uses standard TCG pricing without a grading price-row override", async () => {
  render(<GradingOpportunitiesGrid />);

  const card = await screen.findByText("Charizard", { exact: false });
  expect(card).toHaveAttribute("data-market-override", "false");
  expect(JSON.parse(card.getAttribute("data-prices")!)).toEqual({
    tcgplayer: { NEAR_MINT: { avg: 125 } },
  });
  expect(screen.getByText("143×")).toBeVisible();
  expect(
    screen.getByTitle(
      "TCG Near Mint price -> eBay PSA 10 median (7-day)",
    ),
  ).toBeVisible();
});

test("shows an empty grading category without retry", async () => {
  render(
    <GradingOpportunitiesGrid
      loadCards={() =>
        Promise.resolve({
          fetchedAt: "2026-11-01T12:00:00.000Z",
          items: [],
          status: "ready",
        })
      }
    />,
  );

  expect(
    await screen.findByText("No cards currently meet the grading criteria."),
  ).toBeVisible();
  await waitFor(() =>
    expect(screen.getByLabelText("Grading opportunities")).toHaveAttribute(
      "data-loading",
      "false",
    ),
  );
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});
