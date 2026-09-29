import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { loadPokeTraceSet } from "../../services/pokeTraceSets";
import { SetCategoryGrid } from "./SetCategoryGrid";

vi.mock("../../hooks/usePokeTraceSetNameOptions", () => ({
  usePokeTraceSetNameOptions: () => [
    { label: "Base Set", value: "Base Set" },
    { label: "Base Set 2", value: "Base Set 2" },
  ],
}));

vi.mock("../../services/pokeTraceSets", () => ({
  loadPokeTraceSet: vi.fn(),
}));

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
});

const salesLeaders = {
  leastTotal: { approximate: false, cardId: "Card 2", sales: 8 },
  total: { approximate: true, cardId: "Card 10", sales: 602 },
};

function renderSetExplorer() {
  render(<SetCategoryGrid />);
  expect(screen.getByRole("heading", { name: "Explore sets" })).toBeVisible();
  expect(document.querySelector(".ui-autosuggest__search-icon")).not.toBeNull();
  expect(document.querySelector(".ui-autosuggest__chevron")).toBeNull();
  expect(document.querySelector(".grid-view")).toBeNull();
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

  fireEvent.change(screen.getByRole("combobox", { name: "Set name" }), {
    target: { value: "Set 2" },
  });

  expect(screen.queryByRole("button", { name: "Open Base Set" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open Base Set 2" }));

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
  expect(
    overview.querySelector(".set-explorer-overview__identity"),
  ).toHaveTextContent("2 cards · TCGplayer market data");
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
  expect(within(overview).queryByRole("radio")).toBeNull();
  expect(within(overview).queryByText("7-day TCG sales")).toBeNull();
  expect(within(overview).getByText("Most valuable")).toBeVisible();
  expect(within(overview).getByText("$20.00")).toBeVisible();
  expect(
    overview.querySelector(
      ".set-explorer-overview__valuable .app-card-identity",
    ),
  ).toHaveTextContent("10/102·Card 10");
  const topCardChange = within(overview).getByLabelText(
    "7-day price change 11.1%",
  );
  expect(topCardChange).toHaveTextContent("11.1%");
  expect(
    topCardChange.querySelector(".app-price-change__arrow"),
  ).not.toBeNull();
  const totalSales = within(overview).getByLabelText("Approximately 602 sales");
  expect(totalSales).toHaveTextContent("≈602");
  expect(
    totalSales.closest(".set-explorer-overview__featured"),
  ).toHaveTextContent("Most sold");
  expect(
    totalSales.closest(".set-explorer-overview__featured"),
  ).toHaveTextContent("Card 10");
  const leastSales = within(overview).getByLabelText("8 sales");
  expect(
    leastSales.closest(".set-explorer-overview__featured"),
  ).toHaveTextContent("Least sold");
  expect(
    leastSales.closest(".set-explorer-overview__featured"),
  ).toHaveTextContent("Card 2");
  expect(within(overview).queryByText("7-day NM movement")).toBeNull();
  expect(loadPokeTraceSet).toHaveBeenCalledTimes(1);
  expect(loadPokeTraceSet).toHaveBeenCalledWith(
    "Base Set",
    expect.any(AbortSignal),
  );
  expect(
    screen.getByRole("button", { name: "Sort set cards" }),
  ).toHaveTextContent("Unsorted");
  expect(
    screen.getAllByTestId("set-card").map((node) => node.textContent),
  ).toEqual(["Card 10", "Card 2"]);

  const cardFilter = screen.getByRole("searchbox", {
    name: "Filter set cards",
  });
  fireEvent.click(
    within(overview).getByRole("button", {
      name: "Most valuable: filter cards to Card 10 10/102",
    }),
  );
  expect(cardFilter).toHaveValue("Card 10 10/102");
  expect(cardFilter).toHaveFocus();
  expect(
    screen.getAllByTestId("set-card").map((node) => node.textContent),
  ).toEqual(["Card 10"]);
  fireEvent.click(screen.getByRole("button", { name: "Clear card filter" }));

  fireEvent.click(
    within(overview).getByRole("button", {
      name: "Most sold: filter cards to Card 10 10/102",
    }),
  );
  expect(cardFilter).toHaveValue("Card 10 10/102");
  expect(
    screen.getAllByTestId("set-card").map((node) => node.textContent),
  ).toEqual(["Card 10"]);
  fireEvent.click(screen.getByRole("button", { name: "Clear card filter" }));

  fireEvent.click(
    within(overview).getByRole("button", {
      name: "Least sold: filter cards to Card 2 2/102",
    }),
  );
  expect(cardFilter).toHaveValue("Card 2 2/102");
  expect(
    screen.getAllByTestId("set-card").map((node) => node.textContent),
  ).toEqual(["Card 2"]);
  fireEvent.click(screen.getByRole("button", { name: "Clear card filter" }));

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

  expect(screen.getByRole("button", { name: "Open Base Set" })).toBeDisabled();
  expect(
    screen.getByRole("status", { name: "Loading card category" }),
  ).toBeVisible();
});
