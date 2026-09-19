import { describe, expect, test } from "vitest";
import type { PokeTraceCatalogCard } from "../../shared/pokeTraceCatalog";
import { searchPokeTraceCatalogCards } from "./pokeTraceCatalog";

const cards: PokeTraceCatalogCard[] = [
  {
    id: "charizard-unlimited",
    name: "Charizard",
    number: "004/102",
    setName: "Base Set",
    variant: "Unlimited Holofoil",
    currency: "USD",
    marketPrice: 420,
    priceSnapshots: { "1d": 410, "7d": 400, "30d": 390 },
  },
  {
    id: "charizard-first-edition",
    name: "Charizard",
    number: "004/102",
    setName: "Base Set",
    variant: "1st Edition Holofoil",
    currency: "USD",
    marketPrice: 8_000,
    priceSnapshots: { "1d": null, "7d": null, "30d": null },
  },
  {
    id: "charizard-gym",
    name: "Blaine's Charizard",
    number: "002/132",
    setName: "Gym Challenge",
    currency: "USD",
    marketPrice: 700,
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
});
