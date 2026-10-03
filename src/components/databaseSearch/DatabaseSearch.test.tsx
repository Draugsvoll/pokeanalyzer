import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { DatabaseSearch } from "./DatabaseSearch";

const mocks = vi.hoisted(() => ({
  loadPokeTraceCatalogRarities: vi.fn(),
  loadPokeTraceCatalogSetNames: vi.fn(),
  searchCachedPokeTraceCatalog: vi.fn(),
}));

vi.mock("../../services/pokeTraceCatalog", () => ({
  loadPokeTraceCatalogRarities: mocks.loadPokeTraceCatalogRarities,
  loadPokeTraceCatalogSetNames: mocks.loadPokeTraceCatalogSetNames,
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

function pricedCard(id: string, name: string, price: number): PokemonCard {
  const result = card(id, name);
  result.pokeTrace.prices = {
    tcgplayer: { NEAR_MINT: { avg: price } },
  };
  return result;
}

function changedCard(
  id: string,
  name: string,
  currentPrice: number,
  sevenDayPrice: number,
): PokemonCard {
  const result = pricedCard(id, name, currentPrice);
  result.pokeTrace.marketPriceSnapshots = { "7d": sevenDayPrice };
  return result;
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
  mocks.loadPokeTraceCatalogSetNames.mockReset();
  mocks.loadPokeTraceCatalogSetNames.mockResolvedValue(null);
  mocks.searchCachedPokeTraceCatalog.mockReset();
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("uses the browser catalog without calling the search API", async () => {
  let resolveCatalogRead!: (cards: PokemonCard[]) => void;
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(
    new Promise<PokemonCard[]>((resolve) => {
      resolveCatalogRead = resolve;
    }),
  );
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "charizard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(screen.getByLabelText("Searching")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => {
    resolveCatalogRead([card("card-local", "Local Charizard")]);
  });
  expect(await screen.findByText("Local Charizard")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("suggests matching rarity options from the browser catalog", async () => {
  mocks.loadPokeTraceCatalogRarities.mockResolvedValue([
    "Future Rare",
    "Holo Rare",
  ]);
  renderSearch();

  fireEvent.click(screen.getByRole("button", { name: "Search filters" }));
  const rarityInput = screen.getByRole("combobox", {
    name: "Filter by rarity",
  });
  fireEvent.change(rarityInput, { target: { value: "future" } });

  const futureRareOption = await screen.findByRole("option", {
    name: "Future Rare",
  });
  expect(futureRareOption).toHaveAttribute("tabindex", "-1");
  expect(
    screen.queryByRole("option", { name: "Holo Rare" }),
  ).not.toBeInTheDocument();

  fireEvent.click(futureRareOption);
  expect(rarityInput).toHaveValue("Future Rare");
});

test("marks a suggested set name as an exact catalog match", async () => {
  mocks.loadPokeTraceCatalogSetNames.mockResolvedValue([
    "Base Set",
    "Base Set 2",
  ]);
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => serverResponse([]),
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  const setNameInput = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.change(setNameInput, { target: { value: "base" } });

  const baseSetOption = await screen.findByRole("option", {
    name: "Base Set",
  });
  expect(
    screen.getByRole("option", { name: "Base Set 2" }),
  ).toBeInTheDocument();
  fireEvent.click(baseSetOption);
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("No cards found.")).toBeInTheDocument();
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledWith({
    cardNumber: "",
    maxPrice: undefined,
    minPrice: undefined,
    pokemonName: "",
    rarity: "",
    setName: "Base Set",
    setNameExact: true,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/search?setName=Base+Set&setNameExact=true",
    { signal: expect.any(AbortSignal) },
  );
});

test("keeps static set suggestions when filter options are unavailable", async () => {
  renderSearch();

  const setNameInput = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.change(setNameInput, { target: { value: "aquapolis" } });

  expect(
    await screen.findByRole("option", { name: "Aquapolis" }),
  ).toBeInTheDocument();
});

test("keeps a typed set name as a partial match", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([]);
  renderSearch();

  fireEvent.change(screen.getByRole("combobox", { name: "Set name" }), {
    target: { value: "base" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(await screen.findByText("No cards found.")).toBeInTheDocument();
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledWith({
    cardNumber: "",
    maxPrice: undefined,
    minPrice: undefined,
    pokemonName: "",
    rarity: "",
    setName: "base",
  });
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
    "http://localhost:3001/api/cards/search?pokemonName=charizard",
    { signal: expect.any(AbortSignal) },
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

test("aborts an active server search when the component unmounts", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  let requestSignal: AbortSignal | undefined;
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
    requestSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal?.addEventListener(
        "abort",
        () => reject(requestSignal?.reason),
        { once: true },
      );
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const { unmount } = renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "charizard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(requestSignal?.aborted).toBe(false);

  unmount();

  expect(requestSignal?.aborted).toBe(true);
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
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ json: async () => [], ok: false, status: 503 })
    .mockResolvedValueOnce({
      json: async () => serverResponse([card("card-api", "API Charizard")]),
      ok: true,
    });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "charizard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(
    await screen.findByText(
      "We couldn’t complete your search. Please try again.",
    ),
  ).toHaveAttribute("role", "alert");
  expect(screen.queryByText("No cards found.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  expect(await screen.findByText("API Charizard")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("loads every match and reveals results 50 at a time", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(
    Array.from({ length: 51 }, (_, index) =>
      pricedCard(`card-${index + 1}`, `Card ${index + 1}`, 51 - index),
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
    pricedCard(`server-${index + 1}`, `Server Card ${index + 1}`, 51 - index),
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

test("sorts a local search without making another request", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([
    pricedCard("low-card", "Low Card", 10),
    pricedCard("high-card", "High Card", 20),
  ]);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "card" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("High Card")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Sort search results" }),
  ).toHaveTextContent("Unsorted");
  expect(
    screen
      .getByText("Low Card")
      .compareDocumentPosition(screen.getByText("High Card")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Price: high-low" }));

  expect(document.querySelector(".grid-view")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await waitFor(() =>
    expect(
      screen
        .getByText("High Card")
        .compareDocumentPosition(screen.getByText("Low Card")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy(),
  );
  expect(document.querySelector(".grid-view")).not.toHaveAttribute("aria-busy");

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Unsorted" }));

  await waitFor(() =>
    expect(
      screen
        .getByText("Low Card")
        .compareDocumentPosition(screen.getByText("High Card")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy(),
  );
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("sorts local results by card number", async () => {
  const cardTen = card("card-10", "Card 10");
  cardTen.number = "10";
  const cardTwo = card("card-2", "Card 2");
  cardTwo.number = "2";
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([cardTen, cardTwo]);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "card" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("Card 10")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Number: low-high" }));

  await waitFor(() =>
    expect(
      screen
        .getByText("Card 2")
        .compareDocumentPosition(screen.getByText("Card 10")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy(),
  );
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledTimes(1);
});

test("sorts server results by 7-day percentage change without refetching", async () => {
  mocks.searchCachedPokeTraceCatalog.mockResolvedValue(null);
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () =>
      serverResponse([
        changedCard("steady", "Steady Card", 200, 190),
        changedCard("gainer", "Top Gainer", 150, 100),
      ]),
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "card" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("Steady Card")).toBeInTheDocument();
  expect(
    screen
      .getByText("Steady Card")
      .compareDocumentPosition(screen.getByText("Top Gainer")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "% change: high-low" }));

  await waitFor(() =>
    expect(
      screen
        .getByText("Top Gainer")
        .compareDocumentPosition(screen.getByText("Steady Card")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy(),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/search?pokemonName=card",
    { signal: expect.any(AbortSignal) },
  );
});

test("keeps results closed after sorting locally", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([
    card("card-10", "Card 10"),
    card("card-2", "Card 2"),
  ]);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "card" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("Card 10")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Number: low-high" }));
  fireEvent.click(screen.getByRole("button", { name: "Close search results" }));

  expect(screen.queryByText("Card 10")).not.toBeInTheDocument();
  expect(screen.queryByText("Card 2")).not.toBeInTheDocument();
});

test("keeps the original result set while changing sort", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue([
    card("card-10", "Card 10"),
  ]);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "card" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("Card 10")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Number: low-high" }));

  expect(await screen.findByText("Card 10")).toBeInTheDocument();
  expect(mocks.searchCachedPokeTraceCatalog).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("does not request the server again when server results are sorted", async () => {
  mocks.searchCachedPokeTraceCatalog.mockReturnValue(null);
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () =>
      serverResponse([
        pricedCard("server-1", "Server Card 1", 20),
        pricedCard("server-2", "Server Card 2", 10),
      ]),
    ok: true,
  });
  vi.stubGlobal("fetch", fetchMock);
  renderSearch();

  fireEvent.change(screen.getByRole("textbox", { name: "Pokemon name" }), {
    target: { value: "server" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByText("Server Card 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Sort search results" }));
  fireEvent.click(screen.getByRole("option", { name: "Price: low-high" }));
  await waitFor(() =>
    expect(
      screen
        .getByText("Server Card 2")
        .compareDocumentPosition(screen.getByText("Server Card 1")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy(),
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
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
  fireEvent.focus(screen.getByRole("combobox", { name: "Filter by rarity" }));
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
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:3001/api/cards/search?minPrice=25&maxPrice=100&rarity=Holo+Rare",
    { signal: expect.any(AbortSignal) },
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
    "http://localhost:3001/api/cards/search?condition=LIGHTLY_PLAYED",
    { signal: expect.any(AbortSignal) },
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
