import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { DatabaseSearch } from "./DatabaseSearch";

const mocks = vi.hoisted(() => ({
  searchCachedPokeTraceCatalog: vi.fn(),
}));

vi.mock("../../services/pokeTraceCatalog", () => ({
  searchCachedPokeTraceCatalog: mocks.searchCachedPokeTraceCatalog,
}));

vi.mock("../pokemonCardView/PokemonCardView", () => ({
  PokemonCardView: ({ card }: { card: PokemonCard }) => <div>{card.name}</div>,
}));

function card(id: string, name: string): PokemonCard {
  return {
    id,
    images: { large: "", small: "" },
    name,
    pokeTrace: { currency: "USD", marketplaceUrls: {}, prices: {} },
    set: { id: "base-set", name: "Base Set" },
  };
}

function renderSearch() {
  render(
    <MemoryRouter>
      <DatabaseSearch />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.searchCachedPokeTraceCatalog.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("uses the browser catalog without calling the search API", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([
    card("card-local", "Local Charizard"),
  ]);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "charizard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("Local Charizard")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("falls back to the search API when the browser catalog is unavailable", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => [card("card-api", "API Charizard")],
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "charizard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("API Charizard")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/search?pokemonName=charizard",
  );
});
