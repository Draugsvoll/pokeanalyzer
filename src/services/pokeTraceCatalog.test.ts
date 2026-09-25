import { describe, expect, test } from "vitest";
import type { PokeTraceCatalogCard } from "../../shared/pokeTraceCatalog";
import { POKETRACE_SEARCH_RESULT_LIMIT } from "../../shared/pokeTraceSearch";
import { searchPokeTraceCatalogCards } from "./pokeTraceCatalog";

const cards: PokeTraceCatalogCard[] = [
  {
    id: "charizard-unlimited",
    name: "Charizard",
    number: "004/102",
    rarity: "Holo Rare",
    setName: "Base Set",
    variant: "Unlimited Holofoil",
    currency: "USD",
    conditionPrices: { NEAR_MINT: 420, LIGHTLY_PLAYED: 350 },
    priceSnapshots: { "1d": 410, "7d": 400, "30d": 390 },
  },
  {
    id: "charizard-first-edition",
    name: "Charizard",
    number: "004/102",
    rarity: "Holo Rare",
    setName: "Base Set",
    variant: "1st Edition Holofoil",
    currency: "USD",
    conditionPrices: { NEAR_MINT: 8_000, LIGHTLY_PLAYED: 5_000 },
    priceSnapshots: { "1d": null, "7d": null, "30d": null },
  },
  {
    id: "charizard-gym",
    name: "Blaine's Charizard",
    number: "002/132",
    rarity: "Rare",
    setName: "Gym Challenge",
    currency: "USD",
    conditionPrices: { NEAR_MINT: 700, LIGHTLY_PLAYED: 450 },
    priceSnapshots: { "1d": 690, "7d": 650, "30d": 600 },
  },
];

describe("searchPokeTraceCatalogCards", () => {
  test("matches name and set using the same contains behavior as the API", () => {
    const results = searchPokeTraceCatalogCards(cards, {
      pokemonName: "char",
      setName: "base",
      cardNumber: "",
    });

    expect(results.map((card) => card.id)).toEqual([
      "charizard-unlimited",
      "charizard-first-edition",
    ]);
  });

  test("matches an unpadded numerator without blending other card numbers", () => {
    const results = searchPokeTraceCatalogCards(cards, {
      pokemonName: "",
      setName: "",
      cardNumber: "4",
    });

    expect(results.map((card) => card.id)).toEqual([
      "charizard-unlimited",
      "charizard-first-edition",
    ]);
  });

  test("filters by exact rarity and displayed market-price range", () => {
    const results = searchPokeTraceCatalogCards(cards, {
      pokemonName: "",
      setName: "",
      cardNumber: "",
      minPrice: 500,
      maxPrice: 1_000,
      rarity: "Rare",
    });

    expect(results.map((card) => card.id)).toEqual(["charizard-gym"]);
  });

  test("filters using the selected condition price", () => {
    const results = searchPokeTraceCatalogCards(cards, {
      pokemonName: "",
      setName: "",
      cardNumber: "",
      condition: "LIGHTLY_PLAYED",
      minPrice: 400,
      maxPrice: 500,
    });

    expect(results.map((card) => card.id)).toEqual(["charizard-gym"]);
  });

  test("excludes cards without a price for the selected condition", () => {
    const results = searchPokeTraceCatalogCards(
      [
        ...cards,
        {
          ...cards[0],
          id: "near-mint-only",
          conditionPrices: { NEAR_MINT: 300 },
        },
      ],
      {
        pokemonName: "",
        setName: "",
        cardNumber: "",
        condition: "LIGHTLY_PLAYED",
      },
    );

    expect(results.map((card) => card.id)).not.toContain("near-mint-only");
  });

  test("does not treat Common as a match for Uncommon", () => {
    const results = searchPokeTraceCatalogCards(
      [
        {
          ...cards[0],
          id: "common-card",
          rarity: "Common",
        },
        {
          ...cards[0],
          id: "uncommon-card",
          rarity: "Uncommon",
        },
      ],
      {
        pokemonName: "",
        setName: "",
        cardNumber: "",
        rarity: "Common",
      },
    );

    expect(results.map((card) => card.id)).toEqual(["common-card"]);
  });

  test("returns every matching card", () => {
    const manyCards = Array.from({ length: 75 }, (_, index) => ({
      ...cards[0],
      id: `card-${index + 1}`,
    }));
    const search = {
      pokemonName: "charizard",
      setName: "",
      cardNumber: "",
    };

    expect(searchPokeTraceCatalogCards(manyCards, search)).toHaveLength(75);
  });

  test("sorts before limiting broad searches to 2,000 cards", () => {
    const manyCards = Array.from(
      { length: POKETRACE_SEARCH_RESULT_LIMIT + 1 },
      (_, index) => ({
        ...cards[0],
        id: `card-${index + 1}`,
        conditionPrices: { NEAR_MINT: index + 1 },
      }),
    );

    const results = searchPokeTraceCatalogCards(manyCards, {
      pokemonName: "charizard",
      setName: "",
      cardNumber: "",
      sort: "price-high-low",
    });

    expect(results).toHaveLength(POKETRACE_SEARCH_RESULT_LIMIT);
    expect(results[0]?.id).toBe("card-2001");
    expect(results.at(-1)?.id).toBe("card-2");
  });
});
