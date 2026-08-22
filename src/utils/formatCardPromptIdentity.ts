import type { PokemonCard } from "../types/pokemon";

export function formatCardPromptIdentity(
  card: Pick<PokemonCard, "name" | "number" | "set">,
) {
  return [card.name, card.number, card.set?.name].filter(Boolean).join(" ");
}
