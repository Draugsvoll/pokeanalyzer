import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { POKETRACE_SEARCH_RESULT_LIMIT } from "../../../../shared/pokeTraceSearch";
import type { CardCategoryGridItem } from "../../../components/cardCategoryGrid/CardCategoryGrid";
import {
  loadPokeTraceSet,
  type LoadedPokeTraceSet,
} from "../../../services/pokeTraceSets";
import type { PokemonCard } from "../../../types/pokemon";
import { SetTopCardsGrid } from "./SetTopCardsGrid";

vi.mock("../../../services/pokeTraceSets", () => ({
  loadPokeTraceSet: vi.fn(),
}));
vi.mock("../../../components/cardCategoryGrid/CardCategoryGrid", () => ({
  CardCategoryGrid: ({
    title,
    items,
    minimized,
  }: {
    title: string;
    items: CardCategoryGridItem[];
    minimized?: boolean;
  }) => (
    <section aria-label={title} data-minimized={minimized}>
      {items.map(({ card }) => (
        <span key={card.id}>{card.name}</span>
      ))}
    </section>
  ),
}));

function card(id: string, price: number, setName = "Base Set"): PokemonCard {
  return {
    id,
    name: id,
    image: "",
    set: { id: setName, name: setName },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices: { tcgplayer: { NEAR_MINT: { avg: price } } },
    },
  };
}

function result(cards: PokemonCard[]): LoadedPokeTraceSet {
  return { cards, salesLeaders: { total: null } };
}

beforeEach(() => {
  vi.mocked(loadPokeTraceSet).mockReset();
});

test("ranks the complete response on the frontend and shows the 12 priciest exact set matches minimized", async () => {
  const cards = Array.from({ length: 20 }, (_, index) =>
    card(`Card ${index + 1}`, index + 1),
  );
  cards.push(
    card("Other set", 1000, "Base Set 2"),
    card("No price", 0),
    card("Invalid price", NaN),
  );
  vi.mocked(loadPokeTraceSet).mockResolvedValue(result(cards));
  render(<SetTopCardsGrid setName=" Base Set " />);
  const grid = await screen.findByRole("region", {
    name: "Most Valuable in This Set",
  });
  expect(loadPokeTraceSet).toHaveBeenCalledWith(
    "Base Set",
    expect.any(AbortSignal),
  );
  expect(grid).toHaveAttribute("data-minimized", "true");
  expect(Array.from(grid.children, (child) => child.textContent)).toEqual(
    Array.from({ length: 12 }, (_, index) => `Card ${20 - index}`),
  );
  expect(cards[0].name).toBe("Card 1");
});

test.each([undefined, "", "   "])(
  "skips a missing set name (%s)",
  (setName) => {
    const { container } = render(<SetTopCardsGrid setName={setName} />);
    expect(loadPokeTraceSet).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  },
);

test.each([
  ["empty set", []],
  ["unpriced set", [card("No price", 0)]],
  [
    "capped set",
    Array.from({ length: POKETRACE_SEARCH_RESULT_LIMIT }, (_, index) =>
      card(`Card ${index}`, index + 1),
    ),
  ],
] as const)("silently skips an %s", async (_label, cards) => {
  vi.mocked(loadPokeTraceSet).mockResolvedValue(result([...cards]));
  const { container } = render(<SetTopCardsGrid setName="Base Set" />);
  await act(async () => {});
  expect(container).toBeEmptyDOMElement();
});

test("silently skips fetch and processing failures", async () => {
  vi.mocked(loadPokeTraceSet).mockRejectedValueOnce(new Error("Unavailable"));
  const { container, rerender } = render(
    <SetTopCardsGrid setName="Base Set" />,
  );
  await act(async () => {});
  expect(container).toBeEmptyDOMElement();
  vi.mocked(loadPokeTraceSet).mockResolvedValueOnce({
    cards: null,
  } as unknown as LoadedPokeTraceSet);
  rerender(<SetTopCardsGrid setName="Jungle" />);
  await act(async () => {});
  expect(container).toBeEmptyDOMElement();
});

test("aborts stale requests and never displays cards from the previous set", async () => {
  let resolveFirst!: (value: LoadedPokeTraceSet) => void;
  vi.mocked(loadPokeTraceSet)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    )
    .mockResolvedValueOnce(result([card("Jungle card", 50, "Jungle")]));
  const { rerender, unmount } = render(<SetTopCardsGrid setName="Base Set" />);
  const firstSignal = vi.mocked(loadPokeTraceSet).mock.calls[0][1];
  rerender(<SetTopCardsGrid setName="Jungle" />);
  expect(firstSignal?.aborted).toBe(true);
  await screen.findByText("Jungle card");
  await act(async () => resolveFirst(result([card("Old card", 100)])));
  expect(screen.queryByText("Old card")).not.toBeInTheDocument();
  expect(screen.getByText("Jungle card")).toBeInTheDocument();
  const secondSignal = vi.mocked(loadPokeTraceSet).mock.calls[1][1];
  unmount();
  expect(secondSignal?.aborted).toBe(true);
});

test("hides the previous result immediately while a new set loads", async () => {
  vi.mocked(loadPokeTraceSet).mockResolvedValueOnce(
    result([card("Base card", 100)]),
  );
  const { container, rerender } = render(
    <SetTopCardsGrid setName="Base Set" />,
  );
  await screen.findByText("Base card");
  vi.mocked(loadPokeTraceSet).mockRejectedValueOnce(new Error("Unavailable"));
  rerender(<SetTopCardsGrid setName="Jungle" />);
  expect(container).toBeEmptyDOMElement();
  await waitFor(() => expect(loadPokeTraceSet).toHaveBeenCalledTimes(2));
  expect(container).toBeEmptyDOMElement();
});
