import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MostSoldGrid } from "./MostSoldGrid";

vi.mock("../../services/staticMarketCategories", () => ({
  mostSoldCards: vi.fn().mockResolvedValue({
    fetchedAt: "2026-09-22T12:00:00.000Z",
    items: [
      {
        cardId: "card-1",
        cardNumber: "4/102",
        ebaySales: 20,
        image: null,
        name: "Charizard",
        rarity: "Holo Rare",
        setName: null,
        tcgplayerSales: 30,
        totalSales: 50,
        variant: "Holofoil",
      },
    ],
    snapshotDate: "2026-09-22",
    source: "both",
  }),
}));

vi.mock("../cardCategoryGrid/CardCategoryGrid", () => ({
  CardCategoryGrid: ({
    items,
    loading,
  }: {
    items: Array<{
      card: { name: string; set: { name: string } };
      marketDisplay?: { marketLabel?: string; primaryText?: string };
    }>;
    loading: boolean;
  }) => (
    <div aria-label="Most sold grid" data-loading={loading}>
      {items.map((item) => (
        <span key={item.card.name}>
          {item.card.name} {item.card.set.name}{" "}
          {item.marketDisplay?.primaryText} {item.marketDisplay?.marketLabel}
        </span>
      ))}
    </div>
  ),
}));

test("renders reported sales in a normal card category grid", async () => {
  render(<MostSoldGrid />);

  await waitFor(() =>
    expect(screen.getByLabelText("Most sold grid")).toHaveAttribute(
      "data-loading",
      "false",
    ),
  );
  expect(
    screen.getByText(/Charizard Unknown set 50 sales · TCG \+ eBay/),
  ).toBeVisible();
});
