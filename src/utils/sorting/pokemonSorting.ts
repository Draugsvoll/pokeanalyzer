import type { PokemonCard } from "../../types/pokemon";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";

export type PokemonSortOption =
  | "newest"
  | "price-low"
  | "price-high";

export function sortPokemonCards(
  cards: PokemonCard[],
  sortBy: PokemonSortOption
): PokemonCard[] {
  switch (sortBy) {
    case "price-low":
      return [...cards].sort(
        (a, b) =>
          (getTcgPlayerMarketPrice(a.tcgplayer?.prices) ?? 0) -
          (getTcgPlayerMarketPrice(b.tcgplayer?.prices) ?? 0)
      );

    case "price-high":
      return [...cards].sort(
        (a, b) =>
          (getTcgPlayerMarketPrice(b.tcgplayer?.prices) ?? 0) -
          (getTcgPlayerMarketPrice(a.tcgplayer?.prices) ?? 0)
      );

    case "newest":
    default:
      return [...cards];
  }
}