import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { PokemonCard } from "../../types/pokemon";
import { loadPokeTraceSet } from "../../services/pokeTraceSets";
import { SetCategoryGrid } from "./SetCategoryGrid";

vi.mock("../../hooks/usePokeTraceSetNameOptions", () => ({
  usePokeTraceSetNameOptions: () => [
    { label: "Base Set", value: "Base Set" },
    { label: "Base Set 2", value: "Base Set 2" },
    { label: "Arceus", value: "Arceus" },
    { label: "Battle Academy", value: "Battle Academy" },
    { label: "Unmapped Set", value: "Unmapped Set" },
  ],
}));

vi.mock("../../services/pokeTraceSets", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/pokeTraceSets")>();
  return { ...actual, loadPokeTraceSet: vi.fn() };
});

vi.mock("../pokemonCardView/PokemonCardView", () => ({
  PokemonCardView: ({
    card,
    marketDisplay,
  }: {
    card: PokemonCard;
    marketDisplay?: { condition?: string; price?: number };
  }) => (
    <p
      data-condition={marketDisplay?.condition}
      data-price={marketDisplay?.price}
      data-testid="set-card"
    >
      {card.name}
    </p>
  ),
}));

function card(id: string, number: string, price: number): PokemonCard {
  return {
    id,
    image: `https://example.com/${id}.webp`,
    name: id,
    number,
    set: { id: "base-set", name: "Base Set" },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      marketPriceSnapshots: { "7d": price * 0.9 },
      prices: {
        tcgplayer: {
          LIGHTLY_PLAYED: { avg: price / 2 },
          NEAR_MINT: { avg: price },
        },
      },
    },
  };
}

beforeEach(() => {
  vi.mocked(loadPokeTraceSet).mockReset();
  window.sessionStorage.clear();
});

const salesLeaders = {
  leastTotal: { approximate: false, cardId: "Card 2", sales: 8 },
  total: { approximate: true, cardId: "Card 10", sales: 602 },
};

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>
  );
}

function renderSetExplorer(initialEntry = "/set") {
  const result = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SetCategoryGrid />
      <CurrentLocation />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "Explore sets" })).toBeVisible();
  if (!initialEntry.includes("?set=")) {
    expect(
      document.querySelector(".ui-autosuggest__search-icon"),
    ).not.toBeNull();
    expect(document.querySelector(".ui-autosuggest__chevron")).toBeNull();
    expect(document.querySelector(".grid-view")).toBeNull();
  }
  return result;
}

test("rejects manually typed text even when it exactly matches an option", () => {
  renderSetExplorer();
  const input = screen.getByRole("combobox", { name: "Set name" });

  fireEvent.change(input, { target: { value: "Base Set" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription(
    "Choose a set from the suggestions before opening it.",
  );
  expect(loadPokeTraceSet).not.toHaveBeenCalled();
});

test("filters the set directory and opens a set from its card", async () => {
  vi.mocked(loadPokeTraceSet).mockResolvedValue({
    cards: [card("Card 2", "2/102", 10)],
    salesLeaders,
  });
  renderSetExplorer();

  expect(screen.getByRole("button", { name: "Open Base Set" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Open Base Set 2" })).toBeVisible();
  const baseGroup = screen
    .getByRole("heading", { level: 3, name: "Base" })
    .closest("section");
  const otherGroup = screen
    .getByRole("heading", { level: 3, name: "Other" })
    .closest("section");
  expect(baseGroup).toContainElement(
    screen.getByRole("button", { name: "Open Base Set" }),
  );
  expect(baseGroup).toHaveClass("ui-scroll-reveal");
  expect(screen.getByRole("button", { name: "Open Base Set" })).toHaveClass(
    "ui-render-fade",
  );
  expect(otherGroup).toContainElement(
    screen.getByRole("button", { name: "Open Unmapped Set" }),
  );
  expect(
    baseGroup?.querySelectorAll(".set-category-grid__set-card")[0],
  ).toHaveAccessibleName("Open Base Set 2");
  expect(
    screen
      .getByRole("heading", { level: 3, name: "Sword & Shield" })
      .compareDocumentPosition(
        screen.getByRole("heading", { level: 3, name: "Platinum" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    screen
      .getByRole("heading", { level: 3, name: "Base" })
      .compareDocumentPosition(
        screen.getByRole("heading", { level: 3, name: "Other" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Open Base Set" }),
  ).toHaveTextContent("Base Set1999 · 102 cards");
  expect(
    screen.getByRole("button", { name: "Open Base Set" }),
  ).not.toHaveTextContent("Base ·");

  fireEvent.change(screen.getByRole("combobox", { name: "Set name" }), {
    target: { value: "Set 2" },
  });

  expect(screen.queryByRole("button", { name: "Open Base Set" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open Base Set 2" }));

  expect(screen.getByTestId("current-location")).toHaveTextContent(
    "/set?set=Base+Set+2",
  );

  await waitFor(() =>
    expect(loadPokeTraceSet).toHaveBeenCalledWith(
      "Base Set 2",
      expect.any(AbortSignal),
    ),
  );
  expect(screen.getByRole("combobox", { name: "Set name" })).toHaveValue(
    "Base Set 2",
  );
});

test("opens the set named in the URL", async () => {
  vi.mocked(loadPokeTraceSet).mockResolvedValue({
    cards: [card("Card 2", "2/102", 10)],
    salesLeaders,
  });

  renderSetExplorer("/set?set=Base+Set");

  expect(screen.getByRole("combobox", { name: "Set name" })).toHaveValue(
    "Base Set",
  );
  expect(screen.getByRole("heading", { level: 3, name: "Base" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Platinum" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Sword & Shield" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Other" })).toBeNull();
  expect(
    await screen.findByRole("region", { name: "Base Set market overview" }),
  ).toBeVisible();
  expect(loadPokeTraceSet).toHaveBeenCalledTimes(1);
  expect(loadPokeTraceSet).toHaveBeenCalledWith(
    "Base Set",
    expect.any(AbortSignal),
  );
});

test("defaults to unique card numbers and can show every set card", async () => {
  vi.mocked(loadPokeTraceSet).mockResolvedValue({
    cards: [
      card("Expensive print", "1/102", 20),
      card("Cheapest print", "1/102", 10),
      card("Other card", "2/102", 5),
    ],
    salesLeaders: {
      leastTotal: {
        approximate: false,
        cardId: "Other card",
        sales: 2,
      },
      total: {
        approximate: false,
        cardId: "Expensive print",
        sales: 20,
      },
    },
  });

  renderSetExplorer("/set?set=Base+Set");

  const overview = await screen.findByRole("region", {
    name: "Base Set market overview",
  });
  const scope = within(overview).getByRole("radiogroup", {
    name: "Cards included in set value",
  });
  expect(scope).toHaveClass("segmented-radio-group--small");
  expect(within(scope).getByRole("radio", { name: "Unique" })).toBeChecked();
  expect(within(scope).getByRole("radio", { name: "All" })).not.toBeChecked();
  expect(within(overview).getByText("2 cards")).toBeVisible();
  expect(within(overview).getByText("$15.00")).toBeVisible();
  const mostValuable = within(overview)
    .getByText("Most valuable")
    .closest("article");
  expect(mostValuable).not.toBeNull();
  expect(within(mostValuable!).getByText("Cheapest print")).toBeVisible();
  expect(within(mostValuable!).getByText("$10.00")).toBeVisible();
  expect(
    screen.getAllByTestId("set-card").map(({ textContent }) => textContent),
  ).toEqual(["Cheapest print", "Other card"]);

  fireEvent.click(within(scope).getByRole("radio", { name: "All" }));

  expect(within(scope).getByRole("radio", { name: "All" })).toBeChecked();
  await waitFor(() =>
    expect(within(overview).getByText("3 cards")).toBeVisible(),
  );
  expect(within(overview).getByText("$35.00")).toBeVisible();
  expect(within(mostValuable!).getByText("Expensive print")).toBeVisible();
  expect(within(mostValuable!).getByText("$20.00")).toBeVisible();
  expect(overview).not.toHaveAttribute("aria-busy");
  expect(document.querySelector(".card-grid")).not.toHaveClass(
    "card-grid--sorting",
  );
  expect(
    screen.getAllByTestId("set-card").map(({ textContent }) => textContent),
  ).toEqual(["Expensive print", "Cheapest print", "Other card"]);
});

test("restores the last displayed set from session storage", async () => {
  vi.mocked(loadPokeTraceSet).mockResolvedValue({
    cards: [card("Card 2", "2/102", 10)],
    salesLeaders,
  });
  const firstRender = renderSetExplorer();

  fireEvent.click(screen.getByRole("button", { name: "Open Base Set" }));
  expect(
    await screen.findByRole("region", { name: "Base Set market overview" }),
  ).toBeVisible();
  expect(loadPokeTraceSet).toHaveBeenCalledTimes(1);

  firstRender.unmount();
  vi.mocked(loadPokeTraceSet).mockClear();
  renderSetExplorer("/set?set=Base+Set");

  expect(
    await screen.findByRole("region", { name: "Base Set market overview" }),
  ).toBeVisible();
  expect(loadPokeTraceSet).not.toHaveBeenCalled();
});

test("filters the directory by era and restores it when cleared", () => {
  renderSetExplorer();
  const eraSelect = screen.getByRole("button", { name: "Filter sets by era" });

  fireEvent.click(eraSelect);
  fireEvent.click(screen.getByRole("option", { name: "Base" }));

  expect(screen.getByRole("heading", { level: 3, name: "Base" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Open Base Set" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Open Arceus" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Open Unmapped Set" }),
  ).toBeNull();

  fireEvent.click(eraSelect);
  fireEvent.click(screen.getByRole("option", { name: "Any Era" }));

  expect(eraSelect).toHaveTextContent("Any Era");
  expect(screen.getByRole("button", { name: "Open Arceus" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Open Unmapped Set" }),
  ).toBeVisible();
});

test("shows all set suggestions while combining the directory filters", () => {
  renderSetExplorer();

  fireEvent.click(screen.getByRole("button", { name: "Filter sets by era" }));
  fireEvent.click(screen.getByRole("option", { name: "Base" }));
  const setInput = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.click(setInput);

  const suggestions = screen.getByRole("listbox", {
    name: "Set name suggestions",
  });
  expect(suggestions).toHaveTextContent("Base Set");
  expect(suggestions).toHaveTextContent("Arceus");

  fireEvent.change(setInput, { target: { value: "Arceus" } });
  expect(screen.getByText("No sets match the current filters.")).toBeVisible();
});

test("keeps the set filter when its input is clicked", () => {
  renderSetExplorer();
  const setInput = screen.getByRole("combobox", { name: "Set name" });

  expect(setInput).toHaveAttribute("placeholder", "Set");

  fireEvent.change(setInput, { target: { value: "Base" } });
  fireEvent.click(setInput);
  expect(setInput).toHaveValue("Base");
});

test("keeps the displayed set when either directory filter is clicked", async () => {
  vi.mocked(loadPokeTraceSet).mockResolvedValue({
    cards: [card("Card 2", "2/102", 10)],
    salesLeaders,
  });
  renderSetExplorer();

  fireEvent.click(screen.getByRole("button", { name: "Open Base Set" }));
  expect(
    await screen.findByRole("region", { name: "Base Set market overview" }),
  ).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Filter sets by era" }));
  expect(
    screen.getByRole("region", { name: "Base Set market overview" }),
  ).toBeVisible();
  expect(document.querySelector(".grid-view")).not.toBeNull();

  fireEvent.click(screen.getByRole("combobox", { name: "Set name" }));
  expect(
    screen.getByRole("region", { name: "Base Set market overview" }),
  ).toBeVisible();
  expect(document.querySelector(".grid-view")).not.toBeNull();
});

test("sorts eras and their sets by oldest release year with Other last", () => {
  renderSetExplorer();

  fireEvent.click(screen.getByRole("button", { name: "Sort set directory" }));
  fireEvent.click(screen.getByRole("option", { name: "Oldest" }));

  const headings = screen
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
  expect(headings).toEqual(["Base", "Platinum", "Sword & Shield", "Other"]);

  const baseGroup = screen
    .getByRole("heading", { level: 3, name: "Base" })
    .closest("section");
  expect(
    [
      ...(baseGroup?.querySelectorAll(".set-category-grid__set-card") ?? []),
    ].map((cardElement) => cardElement.getAttribute("aria-label")),
  ).toEqual(["Open Base Set", "Open Base Set 2"]);
});

test("clears the set filter and restores the full directory", () => {
  renderSetExplorer();
  const input = screen.getByRole("combobox", { name: "Set name" });

  fireEvent.change(input, { target: { value: "Set 2" } });
  expect(screen.queryByRole("button", { name: "Open Base Set" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Clear set filter" }));

  expect(input).toHaveValue("");
  expect(screen.getByRole("button", { name: "Open Base Set" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Open Base Set 2" })).toBeVisible();
});

test("opens a selected exact set and sorts the fetched cards locally", async () => {
  vi.mocked(loadPokeTraceSet).mockResolvedValue({
    cards: [card("Card 10", "10/102", 20), card("Card 2", "2/102", 10)],
    salesLeaders,
  });
  renderSetExplorer();
  const input = screen.getByRole("combobox", { name: "Set name" });

  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "Base Set" }));
  fireEvent.keyDown(input, { key: "Enter" });

  await waitFor(() =>
    expect(screen.getAllByTestId("set-card")).toHaveLength(2),
  );
  const overview = screen.getByRole("region", {
    name: "Base Set market overview",
  });
  expect(overview).toHaveClass("ui-scroll-reveal");
  expect(overview.querySelector(".set-explorer-overview__summary")).toHaveClass(
    "app-overview-panel",
    "app-overview-panel--three-featured",
    "ui-render-fade",
  );
  expect(overview.querySelector(".set-explorer-overview__market")).toHaveClass(
    "app-overview-metric",
  );
  expect(
    overview.querySelector(
      ".set-explorer-overview__market .app-overview-metric-content",
    ),
  ).not.toBeNull();
  const resultControls = screen.getByRole("group", {
    name: "Set card controls",
  });
  const firstCard = screen.getAllByTestId("set-card")[0];
  expect(overview.contains(resultControls)).toBe(true);
  expect(resultControls.parentElement).toBe(overview);
  expect(
    overview.compareDocumentPosition(resultControls) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    resultControls.compareDocumentPosition(firstCard) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    within(overview).getByRole("heading", { name: "Base Set" }),
  ).toBeVisible();
  expect(within(overview).getByText("2 cards")).toBeVisible();
  expect(within(overview).getByText("Set value")).toBeVisible();
  expect(within(overview).getByText("2 of 2 cards priced")).toBeVisible();
  const movement = within(overview).getByLabelText(
    "Up by 11.1%. 7-day Near Mint movement",
  );
  expect(movement).toHaveTextContent("11.1%");
  expect(movement.parentElement).toHaveTextContent("11.1%7d");
  expect(movement).toHaveClass("app-price-change--up");
  expect(movement.querySelector(".app-price-change__arrow")).not.toBeNull();
  expect(within(overview).queryByText("Lightly Played")).toBeNull();
  expect(
    within(overview).getByRole("radiogroup", {
      name: "Cards included in set value",
    }),
  ).toBeVisible();
  expect(within(overview).queryByText("7-day TCG sales")).toBeNull();
  const mostValuableMetric = within(overview)
    .getByText("Most valuable")
    .closest("article");
  expect(mostValuableMetric).not.toBeNull();
  expect(within(mostValuableMetric!).getByText("$20.00")).toBeVisible();
  expect(
    overview.querySelector(
      ".set-explorer-overview__valuable .app-card-identity",
    ),
  ).toHaveTextContent("10/102·Card 10");
  const topCardChange = within(mostValuableMetric!).getByLabelText(
    "7-day price change 11.1%",
  );
  expect(topCardChange).toHaveTextContent("11.1%");
  expect(
    topCardChange.querySelector(".app-price-change__arrow"),
  ).not.toBeNull();
  const mostSoldMetric = within(overview)
    .getByText("Most sold")
    .closest("article");
  expect(mostSoldMetric).not.toBeNull();
  expect(within(mostSoldMetric!).getByText("$20.00")).toBeVisible();
  expect(within(mostSoldMetric!).getByText("Card 10")).toBeVisible();
  expect(
    within(mostSoldMetric!).getByLabelText(
      "Most sold card 7-day price change 11.1%",
    ),
  ).toHaveTextContent("11.1%");
  const leastSoldMetric = within(overview)
    .getByText("Least sold")
    .closest("article");
  expect(leastSoldMetric).not.toBeNull();
  expect(within(leastSoldMetric!).getByText("$10.00")).toBeVisible();
  expect(within(leastSoldMetric!).getByText("Card 2")).toBeVisible();
  expect(
    within(leastSoldMetric!).getByLabelText(
      "Least sold card 7-day price change 11.1%",
    ),
  ).toHaveTextContent("11.1%");
  expect(within(overview).queryByText("7-day NM movement")).toBeNull();
  expect(loadPokeTraceSet).toHaveBeenCalledTimes(1);
  expect(loadPokeTraceSet).toHaveBeenCalledWith(
    "Base Set",
    expect.any(AbortSignal),
  );
  expect(
    screen.getByRole("button", { name: "Sort set cards" }),
  ).toHaveTextContent("Unsorted");
  expect(document.querySelector(".grid-view")).toHaveClass("ui-scroll-reveal");
  expect(
    screen.getAllByTestId("set-card").map((node) => node.textContent),
  ).toEqual(["Card 10", "Card 2"]);
  expect(
    overview.querySelectorAll(".set-explorer-overview__featured"),
  ).toHaveLength(3);
  expect(
    overview.querySelectorAll("button.set-explorer-overview__featured"),
  ).toHaveLength(0);

  const cardFilter = screen.getByRole("searchbox", {
    name: "Filter set cards",
  });
  fireEvent.change(cardFilter, { target: { value: "2/102" } });
  expect(
    screen.getAllByTestId("set-card").map((node) => node.textContent),
  ).toEqual(["Card 2"]);
  fireEvent.click(screen.getByRole("button", { name: "Clear card filter" }));
  expect(
    screen.getAllByTestId("set-card").map((node) => node.textContent),
  ).toEqual(["Card 10", "Card 2"]);

  fireEvent.click(screen.getByRole("button", { name: "Sort set cards" }));
  fireEvent.click(screen.getByRole("option", { name: "Number: low-high" }));

  const gridView = document.querySelector(".grid-view");
  expect(gridView).toHaveAttribute("aria-busy", "true");
  expect(overview).not.toHaveAttribute("aria-busy");
  expect(gridView).toHaveClass("ui-scroll-reveal", "ui-scroll-reveal--visible");
  expect(gridView).not.toHaveClass("grid-view--sorting");
  expect(gridView?.querySelector(".card-grid")).toHaveClass(
    "card-grid--sorting",
  );
  await waitFor(() =>
    expect(
      screen.getAllByTestId("set-card").map((node) => node.textContent),
    ).toEqual(["Card 2", "Card 10"]),
  );
  expect(gridView).not.toHaveAttribute("aria-busy");
  expect(overview).not.toHaveAttribute("aria-busy");
  expect(gridView).toHaveClass("ui-scroll-reveal--visible");
  expect(gridView?.querySelector(".card-grid")).not.toHaveClass(
    "card-grid--sorting",
  );
  expect(loadPokeTraceSet).toHaveBeenCalledTimes(1);

  expect(
    screen.getAllByTestId("set-card").map((node) => ({
      condition: node.getAttribute("data-condition"),
      price: node.getAttribute("data-price"),
    })),
  ).toEqual([
    { condition: "NEAR_MINT", price: "10" },
    { condition: "NEAR_MINT", price: "20" },
  ]);

  fireEvent.click(screen.getByRole("button", { name: "Sort set cards" }));
  expect(
    screen.getByRole("option", { name: "% change: high-low" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("option", { name: "Unsorted" }));
  await waitFor(() =>
    expect(
      screen.getAllByTestId("set-card").map((node) => node.textContent),
    ).toEqual(["Card 10", "Card 2"]),
  );
  expect(
    screen.queryByRole("button", { name: "Close set results" }),
  ).toBeNull();
});

test("shows the actual number of set cards remaining", async () => {
  vi.mocked(loadPokeTraceSet).mockResolvedValue({
    cards: Array.from({ length: 51 }, (_, index) =>
      card(`Card ${index + 1}`, `${index + 1}/102`, index + 1),
    ),
    salesLeaders,
  });
  renderSetExplorer();

  const input = screen.getByRole("combobox", { name: "Set name" });
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "Base Set" }));
  fireEvent.keyDown(input, { key: "Enter" });

  expect(
    await screen.findByRole("button", { name: "Show next 1" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Show next 1" }));
  expect(screen.queryByRole("button", { name: /Show next/ })).toBeNull();
});

test("editing a selected value invalidates it until another option is selected", () => {
  renderSetExplorer();
  const input = screen.getByRole("combobox", { name: "Set name" });

  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name: "Base Set" }));
  fireEvent.change(input, { target: { value: "Base Set 2" } });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(loadPokeTraceSet).not.toHaveBeenCalled();
});

test("disables set cards while a set is loading", () => {
  vi.mocked(loadPokeTraceSet).mockReturnValue(new Promise(() => undefined));
  renderSetExplorer();
  fireEvent.click(screen.getByRole("button", { name: "Open Base Set" }));

  const pendingSet = screen.getByRole("button", { name: "Open Base Set" });
  expect(pendingSet).toBeDisabled();
  expect(pendingSet).toHaveAttribute("aria-current", "true");
  expect(pendingSet).toHaveClass("is-active");
  expect(
    screen.getByRole("status", { name: "Loading card category" }),
  ).toBeVisible();
});
