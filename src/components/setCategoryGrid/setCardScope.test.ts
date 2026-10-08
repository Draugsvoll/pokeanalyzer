import { describe, expect, test } from "vitest";
import type { PokemonCard } from "../../types/pokemon";
import { selectUniqueSetCards } from "./setCardScope";

function card(
  id: string,
  number: string | undefined,
  price?: number,
): PokemonCard {
  return {
    id,
    name: id,
    number,
    set: { id: "set", name: "Set" },
    pokeTrace: {
      currency: "USD",
      marketplaceUrls: {},
      prices:
        price === undefined ? {} : { tcgplayer: { NEAR_MINT: { avg: price } } },
    },
  };
}

describe("selectUniqueSetCards", () => {
  test("keeps the cheapest positively priced card for each card number", () => {
    const cards = [
      card("unpriced", "001/100"),
      card("expensive", "001/100", 20),
      card("cheapest", "001/100", 8),
      card("other", "002/100", 12),
    ];

    expect(selectUniqueSetCards(cards).map(({ id }) => id)).toEqual([
      "cheapest",
      "other",
    ]);
  });

  test("keeps one stable fallback when an identity has no valid price", () => {
    const cards = [card("first", "001/100"), card("second", "001/100")];

    expect(selectUniqueSetCards(cards).map(({ id }) => id)).toEqual(["first"]);
  });

  test("excludes cards without a card number", () => {
    const cards = [
      card("missing", undefined, 10),
      card("blank", "   ", 5),
      card("numbered", "SVP001", 8),
    ];

    expect(selectUniqueSetCards(cards).map(({ id }) => id)).toEqual([
      "numbered",
    ]);
  });
});
