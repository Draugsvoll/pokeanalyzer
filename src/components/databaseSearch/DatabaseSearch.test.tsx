import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { DatabaseSearch } from "./DatabaseSearch";

const mocks = vi.hoisted(() => ({
  loadPokeTraceCatalogRarities: vi.fn(),
  searchCachedPokeTraceCatalog: vi.fn(),
  searchInitializedPokeTraceCatalog: vi.fn(),
}));

vi.mock("../../services/pokeTraceCatalog", () => ({
  loadPokeTraceCatalogRarities: mocks.loadPokeTraceCatalogRarities,
  searchCachedPokeTraceCatalog: mocks.searchCachedPokeTraceCatalog,
  searchInitializedPokeTraceCatalog: mocks.searchInitializedPokeTraceCatalog,
}));

vi.mock("../pokemonCardView/PokemonCardView", () => ({
  PokemonCardView: ({
    card,
    marketDisplay,
  }: {
    card: PokemonCard;
    marketDisplay?: { marketLabel?: string; price?: number };
  }) => (
    <div>
      {card.name} {marketDisplay?.marketLabel} {marketDisplay?.price}
    </div>
  ),
}));

function card(id: string, name: string): PokemonCard {
  return {
    id,
    image: "",
    name,
    pokeTrace: { currency: "USD", marketplaceUrls: {}, prices: {} },
    set: { id: "base-set", name: "Base Set" },
  };
}

function serverPage(
  items: PokemonCard[],
  total: number | null = items.length,
  nextOffset: number | null = null,
) {
  return {
    hasMore: nextOffset !== null,
    items,
    nextOffset,
    total,
  };
}

function renderSearch() {
  return render(
    <MemoryRouter>
      <DatabaseSearch />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.loadPokeTraceCatalogRarities.mockReset();
  mocks.loadPokeTraceCatalogRarities.mockResolvedValue(null);
  mocks.searchCachedPokeTraceCatalog.mockReset();
  mocks.searchInitializedPokeTraceCatalog.mockReset();
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

  expect(screen.getByLabelText("Searching")).toBeInTheDocument();
  expect(await screen.findByText("Local Charizard")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("uses rarity options from the browser catalog", async () => {
  mocks.loadPokeTraceCatalogRarities.mockResolvedValue(["Future Rare"]);
  renderSearch();

  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter by rarity" }));

  expect(
    await screen.findByRole("option", { name: "Future Rare" }),
  ).toBeInTheDocument();
});

test("falls back to the search API when the browser catalog is unavailable", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => serverPage([card("card-api", "API Charizard")]),
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
    "http://localhost:3001/api/cards/search?pokemonName=charizard&offset=0&sort=price-high-low",
  );
});

test("distinguishes an empty search from a failed request", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([]);
  const { unmount } = renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "missing" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("No cards found.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();

  unmount();
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: async () => [], ok: false, status: 503 }),
  );
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "charizard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(
    await screen.findByText(
      "Search is temporarily unavailable. Please try again.",
    ),
  ).toHaveAttribute("role", "alert");
  expect(screen.queryByText("No cards found.")).not.toBeInTheDocument();
});

test("loads every match and reveals results 50 at a time", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(
    Array.from({ length: 51 }, (_, index) =>
      card(`card-${index + 1}`, `Card ${index + 1}`),
    ),
  );
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "card" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("Card 50")).toBeInTheDocument();
  expect(screen.queryByText("Card 51")).not.toBeInTheDocument();
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledWith({
    cardNumber: "",
    maxPrice: undefined,
    minPrice: undefined,
    pokemonName: "card",
    rarity: "",
    setName: "",
    sort: "price-high-low",
  });

  fireEvent.click(screen.getByRole("button", { name: "Show next 50" }));

  expect(screen.getByText("Card 51")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Show next/ }),
  ).not.toBeInTheDocument();
});

test("loads server results in pages while showing the total count", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  const firstPage = Array.from({ length: 50 }, (_, index) =>
    card(`server-${index + 1}`, `Server Card ${index + 1}`),
  );
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      json: async () => serverPage(firstPage, 51, 50),
      ok: true,
    })
    .mockResolvedValueOnce({
      json: async () => serverPage([card("server-51", "Server Card 51")], null),
      ok: true,
    });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "server" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText(/51 cards matching/)).toBeInTheDocument();
  expect(screen.queryByText("Server Card 51")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Show next 50" }));

  expect(await screen.findByText("Server Card 51")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "http://localhost:3001/api/cards/search?pokemonName=server&offset=50&sort=price-high-low",
  );
  expect(
    screen.queryByRole("button", { name: "Show next 50" }),
  ).not.toBeInTheDocument();
});

test("ignores a pending page after the results are closed", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  let resolveNextPage!: (response: {
    json: () => Promise<ReturnType<typeof serverPage>>;
    ok: boolean;
  }) => void;
  const pendingNextPage = new Promise<{
    json: () => Promise<ReturnType<typeof serverPage>>;
    ok: boolean;
  }>((resolve) => {
    resolveNextPage = resolve;
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      json: async () => serverPage([card("server-1", "Server Card 1")], 2, 1),
      ok: true,
    })
    .mockReturnValueOnce(pendingNextPage);
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "server" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("Server Card 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Show next 50" }));
  fireEvent.click(screen.getByRole("button", { name: "Close search results" }));

  await act(async () => {
    resolveNextPage({
      json: async () => serverPage([card("server-2", "Server Card 2")], null),
      ok: true,
    });
    await pendingNextPage;
  });

  expect(screen.queryByText("Server Card 1")).not.toBeInTheDocument();
  expect(screen.queryByText("Server Card 2")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Close search results" }),
  ).not.toBeInTheDocument();
});

test("supports filter-only searches and forwards the filters", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => serverPage([card("filtered-card", "Filtered Charizard")]),
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum price" }), {
    target: { value: "25" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum price" }), {
    target: { value: "100" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Filter by rarity" }));
  fireEvent.click(screen.getByRole("option", { name: "Holo Rare" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("Filtered Charizard")).toBeInTheDocument();
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledWith({
    cardNumber: "",
    maxPrice: 100,
    minPrice: 25,
    pokemonName: "",
    rarity: "Holo Rare",
    setName: "",
    sort: "price-high-low",
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/search?minPrice=25&maxPrice=100&rarity=Holo+Rare&offset=0&sort=price-high-low",
  );
});

test("uses the local catalog and selected TCGPlayer price for condition searches", async () => {
  const lightlyPlayedCard = card("condition-card", "Played Charizard");
  lightlyPlayedCard.pokeTrace.prices = {
    tcgplayer: { LIGHTLY_PLAYED: { avg: 30 } },
  };
  mocks.searchInitializedPokeTraceCatalog.mockResolvedValue([
    lightlyPlayedCard,
  ]);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter by condition" }));
  fireEvent.click(screen.getByRole("option", { name: "Lightly Played" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(
    await screen.findByText("Played Charizard Lightly Played 30"),
  ).toBeInTheDocument();
  expect(mocks.searchCachedPokeTraceCatalog).not.toHaveBeenCalled();
  expect(mocks.searchInitializedPokeTraceCatalog).toHaveBeenCalledWith({
    cardNumber: "",
    condition: "LIGHTLY_PLAYED",
    maxPrice: undefined,
    minPrice: undefined,
    pokemonName: "",
    rarity: "",
    setName: "",
    sort: "price-high-low",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("shows an error without using the server when condition search is unavailable", async () => {
  mocks.searchInitializedPokeTraceCatalog.mockResolvedValue(null);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter by condition" }));
  fireEvent.click(screen.getByRole("option", { name: "Lightly Played" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(
    await screen.findByText("Condition search is temporarily unavailable."),
  ).toHaveAttribute("role", "alert");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("does not use the server when a local condition search has no matches", async () => {
  mocks.searchInitializedPokeTraceCatalog.mockResolvedValue([]);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter by condition" }));
  fireEvent.click(screen.getByRole("option", { name: "Damaged" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("No cards found.")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("prevents a search when the minimum price exceeds the maximum", () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([]);
  renderSearch();

  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Minimum price" }), {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum price" }), {
    target: { value: "25" },
  });

  expect(
    screen.getByRole("spinbutton", { name: "Minimum price" }),
  ).not.toHaveAttribute("aria-invalid");
  const maximumPrice = screen.getByRole("spinbutton", {
    name: "Maximum price",
  });
  const validationMessage = screen.getByText(
    "Maximum price cannot be lower than minimum price.",
  );
  expect(maximumPrice).toHaveAttribute("aria-invalid", "true");
  expect(maximumPrice).toHaveAttribute(
    "aria-describedby",
    validationMessage.id,
  );
  expect(validationMessage).toHaveClass("database-search-visually-hidden");
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
});

test("closes an embedded search from the results toolbar", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([
    card("card-local", "Local Charizard"),
  ]);
  const onClose = vi.fn();

  render(
    <MemoryRouter>
      <DatabaseSearch embedded onClose={onClose} />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "charizard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Close search results" }),
  );

  expect(onClose).toHaveBeenCalledOnce();
});
