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

test("collapses and expands a card category from its header", () => {
  render(
    <CardCategoryGrid
      items={[{ card }]}
      title="Daily Top Sellers on TCGPlayer"
    />,
  );

  const heading = screen.getByRole("heading", {
    name: "Daily Top Sellers on TCGPlayer",
  });
  const collapseButton = screen.getByRole("button", {
    name: "Collapse Daily Top Sellers on TCGPlayer",
  });
  const content = document.getElementById(
    collapseButton.getAttribute("aria-controls") ?? "",
  );

  expect(heading).toBeVisible();
  expect(collapseButton).toHaveAttribute("aria-expanded", "true");
  expect(content).not.toHaveAttribute("hidden");
  expect(screen.getByText("Pikachu")).toBeInTheDocument();

  fireEvent.click(collapseButton);

  expect(
    screen.getByRole("button", {
      name: "Expand Daily Top Sellers on TCGPlayer",
    }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(content).toHaveAttribute("hidden");

  fireEvent.click(
    screen.getByRole("button", {
      name: "Expand Daily Top Sellers on TCGPlayer",
    }),
  );

  expect(content).not.toHaveAttribute("hidden");
});
