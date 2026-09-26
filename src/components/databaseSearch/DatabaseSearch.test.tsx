import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { DatabaseSearch } from "./DatabaseSearch";

const mocks = vi.hoisted(() => ({
  loadPokeTraceCatalogRarities: vi.fn(),
  searchCachedPokeTraceCatalog: vi.fn(),
}));

vi.mock("../../services/pokeTraceCatalog", () => ({
  loadPokeTraceCatalogRarities: mocks.loadPokeTraceCatalogRarities,
  searchCachedPokeTraceCatalog: mocks.searchCachedPokeTraceCatalog,
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

function serverResponse(items: PokemonCard[], total = items.length) {
  return { items, total };
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
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
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
    json: async () => serverResponse([card("card-api", "API Charizard")]),
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
    "http://localhost:3001/api/cards/search?pokemonName=charizard&sort=price-high-low",
  );
});

test("uses the server while browser catalog initialization continues", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => serverResponse([card("card-api", "API Charizard")]),
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "charizard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("API Charizard")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledOnce();
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
    await screen.findByText("Something went wrong. Please try again later."),
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

test("reveals server fallback results 50 at a time", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  const serverResults = Array.from({ length: 51 }, (_, index) =>
    card(`server-${index + 1}`, `Server Card ${index + 1}`),
  );
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => serverResponse(serverResults, 51),
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "server" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText(/51 cards matching/)).toBeInTheDocument();
  expect(screen.getByText("Server Card 50")).toBeInTheDocument();
  expect(screen.queryByText("Server Card 51")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Show next 50" }));

  expect(screen.getByText("Server Card 51")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Show next 50" }),
  ).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("pins a local search to the server after sort fallback until the next search", async () => {
  mocks.searchCachedPokeTraceCatalog
    .mockReturnValueOnce([card("high-card", "High Card")])
    .mockReturnValueOnce(null)
    .mockReturnValue([card("new-local", "New Local Catalog Card")]);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      json: async () => serverResponse([card("server-low", "Server Low Card")]),
      ok: true,
    })
    .mockResolvedValueOnce({
      json: async () =>
        serverResponse([card("server-high", "Server High Card")]),
      ok: true,
    });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "card" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("High Card")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Price: low to high" }));

  expect(await screen.findByText("Server Low Card")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "http://localhost:3001/api/cards/search?pokemonName=card&sort=price-low-high",
  );

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Price: high to low" }));

  expect(await screen.findByText("Server High Card")).toBeInTheDocument();
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole("button", { name: "Close search results" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("New Local Catalog Card")).toBeInTheDocument();
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("ignores a pending server sort after the results are closed", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  let resolveSort!: (response: {
    json: () => Promise<ReturnType<typeof serverResponse>>;
    ok: boolean;
  }) => void;
  const pendingSort = new Promise<{
    json: () => Promise<ReturnType<typeof serverResponse>>;
    ok: boolean;
  }>((resolve) => {
    resolveSort = resolve;
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      json: async () => serverResponse([card("server-1", "Server Card 1")]),
      ok: true,
    })
    .mockReturnValueOnce(pendingSort);
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "server" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("Server Card 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Price: low to high" }));
  fireEvent.click(screen.getByRole("button", { name: "Close search results" }));

  await act(async () => {
    resolveSort({
      json: async () => serverResponse([card("server-2", "Server Card 2")]),
      ok: true,
    });
    await pendingSort;
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
    json: async () =>
      serverResponse([card("filtered-card", "Filtered Charizard")]),
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
    "http://localhost:3001/api/cards/search?minPrice=25&maxPrice=100&rarity=Holo+Rare&sort=price-high-low",
  );
});

test("uses the local catalog and selected TCGPlayer price for condition searches", async () => {
  const lightlyPlayedCard = card("condition-card", "Played Charizard");
  lightlyPlayedCard.pokeTrace.prices = {
    tcgplayer: { LIGHTLY_PLAYED: { avg: 30 } },
  };
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([lightlyPlayedCard]);
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
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledWith({
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

test("uses the server fallback when local condition search is unavailable", async () => {
  const lightlyPlayedCard = card("server-condition", "Server Charizard");
  lightlyPlayedCard.pokeTrace.prices = {
    tcgplayer: { LIGHTLY_PLAYED: { avg: 30 } },
  };
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => serverResponse([lightlyPlayedCard]),
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter by condition" }));
  fireEvent.click(screen.getByRole("option", { name: "Lightly Played" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(
    await screen.findByText("Server Charizard Lightly Played 30"),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/search?condition=LIGHTLY_PLAYED&sort=price-high-low",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("does not use the server when a local condition search has no matches", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([]);
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
