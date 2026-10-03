import type { PokemonCard } from "../../types/pokemon";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";

export type SetCardScope = "unique" | "all";

function cardIdentity(card: PokemonCard) {
  const number = card.number?.trim().toLocaleLowerCase("en-US");
  return number ? `number:${number}` : `id:${card.id}`;
}

export function selectUniqueSetCards(cards: readonly PokemonCard[]) {
  const selectedByIdentity = new Map<
    string,
    { card: PokemonCard; price: number | null }
  >();

  for (const card of cards) {
    const identity = cardIdentity(card);
    const price = resolvePokeTraceCardPrice(card, "NEAR_MINT")?.price ?? null;
    const selected = selectedByIdentity.get(identity);

    if (
      !selected ||
      (price !== null && (selected.price === null || price < selected.price))
    ) {
      selectedByIdentity.set(identity, { card, price });
    }
  }

  return [...selectedByIdentity.values()].map(({ card }) => card);
}
