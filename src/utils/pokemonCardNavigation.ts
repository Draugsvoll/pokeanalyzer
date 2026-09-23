import type { NavigateFunction } from "react-router-dom";
import type { PokemonCard } from "../types/pokemon";

export function preloadPokemonImage(url?: string): void {
  if (!url) return;

  const image = new Image();
  image.src = url;
}

export function navigateToPokemonCard(
  navigate: NavigateFunction,
  card: PokemonCard,
): void {
  preloadPokemonImage(card.image);
  navigate(`/card/${encodeURIComponent(card.id)}`, {
    state: { card },
  });
}
