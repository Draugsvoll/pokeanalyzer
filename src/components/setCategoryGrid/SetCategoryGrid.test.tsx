import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { loadPokeTraceSetCards } from "../../services/pokeTraceSets";
import { SetCategoryGrid } from "./SetCategoryGrid";

vi.mock("../../hooks/usePokeTraceSetNameOptions", () => ({
  usePokeTraceSetNameOptions: () => [
    { label: "Base Set", value: "Base Set" },
    { label: "Base Set 2", value: "Base Set 2" },
  ],
}));

vi.mock("../../services/pokeTraceSets", () => ({
  loadPokeTraceSetCards: vi.fn(),
}));

vi.mock("../pokemonCardView/PokemonCardView", () => ({
  PokemonCardView: ({ card }: { card: PokemonCard }) => (
    <p data-testid="set-card">{card.name}</p>
  ),
}));

function card(id: string, number: string, price: number): PokemonCard {
  return {
    id,
    name: id,
    number,
    set: { id: "base-set", name: "Base Set" },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices: { tcgplayer: { NEAR_MINT: { avg: price } } },
    },
  };
}

beforeEach(() => {
  vi.mocked(loadPokeTraceSetCards).mockReset();
});

function renderExpandedSetGrid() {
  render(<SetCategoryGrid />);
  fireEvent.click(screen.getByRole("button", { name: "Expand Explore a Set" }));
}

test("rejects manually typed text even when it exactly matches an option", () => {
  renderExpandedSetGrid();
  const input = screen.getByRole("combobox", { name: "Set name" });

  fireEvent.change(input, { target: { value: "Base Set" } });
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription(
    "Choose a set from the suggestions before opening it.",
  );
  expect(loadPokeTraceSetCards).not.toHaveBeenCalled();
});

test("opens a selected exact set and sorts the fetched cards locally", async () => {
  vi.mocked(loadPokeTraceSetCards).mockResolvedValue([
    card("Card 10", "10/102", 20),
    card("Card 2", "2/102", 10),
  ]);
  renderExpandedSetGrid();
  const input = screen.getByRole("combobox", { name: "Set name" });

  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "Base Set" }));
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  await waitFor(() =>
    expect(screen.getAllByTestId("set-card")).toHaveLength(2),
  );
  expect(loadPokeTraceSetCards).toHaveBeenCalledTimes(1);
  expect(loadPokeTraceSetCards).toHaveBeenCalledWith(
    "Base Set",
    expect.any(AbortSignal),
  );
  expect(
    screen.getByRole("button", { name: "Sort set cards" }),
  ).toHaveTextContent("Unsorted");
  expect(
    screen.getAllByTestId("set-card").map((node) => node.textContent),
  ).toEqual(["Card 10", "Card 2"]);

  fireEvent.click(screen.getByRole("button", { name: "Sort set cards" }));
  fireEvent.click(screen.getByRole("option", { name: "Number: low-high" }));

  expect(document.querySelector(".grid-view")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await waitFor(() =>
    expect(
      screen.getAllByTestId("set-card").map((node) => node.textContent),
    ).toEqual(["Card 2", "Card 10"]),
  );
  expect(document.querySelector(".grid-view")).not.toHaveAttribute("aria-busy");
  expect(loadPokeTraceSetCards).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Sort set cards" }));
  fireEvent.click(screen.getByRole("option", { name: "Unsorted" }));
  await waitFor(() =>
    expect(
      screen.getAllByTestId("set-card").map((node) => node.textContent),
    ).toEqual(["Card 10", "Card 2"]),
  );

  fireEvent.click(screen.getByRole("button", { name: "Close set results" }));

  expect(screen.queryAllByTestId("set-card")).toHaveLength(0);
  expect(input).toHaveValue("Base Set");
  expect(
    screen.queryByRole("button", { name: "Close set results" }),
  ).toBeNull();
});

test("editing a selected value invalidates it until another option is selected", () => {
  renderExpandedSetGrid();
  const input = screen.getByRole("combobox", { name: "Set name" });

  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "Base Set" }));
  fireEvent.change(input, { target: { value: "Base Set 2" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(loadPokeTraceSetCards).not.toHaveBeenCalled();
});

test("shows the shared button spinner while a set is loading", () => {
  vi.mocked(loadPokeTraceSetCards).mockReturnValue(
    new Promise(() => undefined),
  );
  renderExpandedSetGrid();
  const input = screen.getByRole("combobox", { name: "Set name" });

  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "Base Set" }));
  fireEvent.click(screen.getByRole("button", { name: "Open" }));

  const loadingButton = screen.getByRole("button", { name: "Opening set" });
  expect(loadingButton).toHaveAttribute("aria-busy", "true");
  expect(loadingButton.querySelector(".app-btn__spinner")).not.toBeNull();
  expect(screen.queryByText(/Opening/)).toBeNull();
});
