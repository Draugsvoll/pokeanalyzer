import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { CardCategoryGrid } from "./CardCategoryGrid";

vi.mock("../pokemonCardView/PokemonCardView", () => ({
  PokemonCardView: ({ card }: { card: PokemonCard }) => <p>{card.name}</p>,
}));

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

test("offers a retry action when a category request fails", () => {
  const onRetry = vi.fn();

  render(
    <CardCategoryGrid
      error="Market data is temporarily unavailable."
      items={[]}
      onRetry={onRetry}
      title="Daily movers"
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Market data is temporarily unavailable.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});
