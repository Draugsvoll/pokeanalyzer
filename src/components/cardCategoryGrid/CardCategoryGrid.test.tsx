import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { getGradingOpportunityList } from "../../services/gradingOpportunityListApi";
import type { PokemonCard } from "../../types/pokemon";
import { CardCategoryGrid } from "./CardCategoryGrid";

vi.mock("../pokemonCardView/PokemonCardView", () => ({
  PokemonCardView: ({
    card,
    badge,
  }: {
    card: PokemonCard;
    badge?: ReactNode;
  }) => (
    <p>
      {card.name}
      {badge}
    </p>
  ),
}));
vi.mock("../../services/gradingOpportunityListApi", () => ({
  getGradingOpportunityList: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(getGradingOpportunityList).mockReset().mockResolvedValue(null);
});

const card: PokemonCard = {
  id: "card-1",
  image: "",
  name: "Pikachu",
  pokeTrace: { currency: "USD", marketplaceUrls: {}, prices: {} },
  set: { id: "base-set", name: "Base Set" },
};

test.each([undefined, false])(
  "shows the full category without a toggle when minimized is %s",
  (minimized) => {
    const { container } = render(
      <CardCategoryGrid
        minimized={minimized}
        items={[{ card }, { card: { ...card, id: "card-2", name: "Eevee" } }]}
        title="Daily Top Sellers on TCGPlayer"
      />,
    );
    expect(screen.getByText("Pikachu")).toBeVisible();
    expect(screen.getByText("Eevee")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector(".grid-header__chevron")).toBeNull();
    fireEvent.click(screen.getByRole("heading"));
    expect(screen.getByText("Pikachu")).toBeVisible();
    expect(screen.getByText("Eevee")).toBeVisible();
  },
);

test("shows a failed category without a retry button", () => {
  render(
    <CardCategoryGrid
      error="Market data is temporarily unavailable."
      items={[]}
      title="Daily movers"
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Market data is temporarily unavailable.",
  );
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
});

test("category filter converts matching loaded cards to grading opportunity cards", async () => {
  vi.mocked(getGradingOpportunityList).mockResolvedValue({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    items: [{ cardId: card.id, psa10Price: 1000 }],
  });
  render(
    <CardCategoryGrid
      items={[
        {
          card: {
            ...card,
            pokeTrace: {
              ...card.pokeTrace,
              prices: { tcgplayer: { NEAR_MINT: { avg: 50 } } },
            },
          },
        },
        { card: { ...card, id: "other", name: "Eevee" } },
      ]}
    />,
  );
  const checkbox = await screen.findByRole("checkbox", {
    name: "1 grading opportunity",
  });
  expect(checkbox.closest("header")).not.toBeNull();
  fireEvent.click(checkbox);
  expect(screen.queryByText("Eevee")).toBeNull();
  expect(checkbox).toHaveAccessibleName("1 grading opportunity");
  expect(
    screen.getByLabelText(
      "20 times TCGPlayer Near Mint price, based on eBay PSA 10 30-day median",
    ),
  ).toBeVisible();
  fireEvent.click(checkbox);
  expect(screen.getByText("Eevee")).toBeVisible();
});
