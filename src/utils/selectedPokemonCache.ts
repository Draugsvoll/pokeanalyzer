import type { NavigateFunction } from "react-router-dom";
import { SELECTED_POKEMON_CACHE_KEY } from "../constants/cache";
import type { PokemonCard } from "../types/pokemon";

export function getSelectedPokemonFromCache(
  cardId?: string
): PokemonCard | null {
  if (!cardId) return null;

  try {
    const stored = localStorage.getItem(SELECTED_POKEMON_CACHE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as PokemonCard;
    delete parsed.grok;
    return parsed.id === cardId ? parsed : null;
  } catch {
    return null;
  }
}

export function setSelectedPokemonCache(card: PokemonCard): void {
  const publicCard = { ...card };
  delete publicCard.grok;
  localStorage.setItem(
    SELECTED_POKEMON_CACHE_KEY,
    JSON.stringify(publicCard),
  );
}

export function preloadPokemonImage(url?: string): void {
  if (!url) return;

  const image = new Image();
  image.src = url;
}

export function navigateToPokemonCard(
  navigate: NavigateFunction,
  card: PokemonCard,
  options?: { scrollToCardView?: boolean },
): void {
  setSelectedPokemonCache(card);
  preloadPokemonImage(card.images?.large ?? card.images?.small);
  navigate(`/card/${card.id}`, {
    state: {
      card,
      ...(options?.scrollToCardView && { scrollToCardView: true }),
    },
  });
}
