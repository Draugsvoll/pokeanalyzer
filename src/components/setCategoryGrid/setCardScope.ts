import type { PokemonCard } from "../../types/pokemon";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";
import { selectUniqueSetCardsByPrice } from "../../../shared/selectUniqueSetCards";

export type SetCardScope = "unique" | "all";

export function selectUniqueSetCards(cards: readonly PokemonCard[]) {
  return selectUniqueSetCardsByPrice(
    cards.filter((card) => card.number?.trim()),
    (card) => resolvePokeTraceCardPrice(card, "NEAR_MINT")?.price ?? null,
  );
}
