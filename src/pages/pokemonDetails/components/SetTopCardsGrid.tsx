import { POKETRACE_SEARCH_RESULT_LIMIT } from "../../../../shared/pokeTraceSearch";
import { CardCategoryGrid } from "../../../components/cardCategoryGrid/CardCategoryGrid";
import { useSetRecommendations } from "../../../hooks/useSetRecommendations";
import { loadPokeTraceSet } from "../../../services/pokeTraceSets";
import { resolvePokeTraceCardPrice } from "../../../utils/pokeTracePricing";
import { sortPokeTraceCards } from "../../../utils/sortPokeTraceCards";

async function loadTopCards(setName: string, signal: AbortSignal) {
  const { cards } = await loadPokeTraceSet(setName, signal);
  // A capped response may omit pricier cards; do not rank an incomplete set.
  if (signal.aborted || cards.length >= POKETRACE_SEARCH_RESULT_LIMIT)
    return [];
  const normalizedName = setName.toLocaleLowerCase("en-US");
  const matchingCards = cards.filter(
    (card) =>
      card.set.name.trim().toLocaleLowerCase("en-US") === normalizedName &&
      resolvePokeTraceCardPrice(card) !== undefined,
  );
  return sortPokeTraceCards(matchingCards, "price-high-low")
    .slice(0, 12)
    .map((card) => ({ card }));
}

export function SetTopCardsGrid({ setName }: { setName?: string }) {
  const name = setName?.trim() ?? "";
  const items = useSetRecommendations(name, loadTopCards);
  if (!items?.length) return null;

  return (
    <CardCategoryGrid
      key={name}
      items={items}
      minimized
      subtitle={name}
      title="Most Valuable in This Set"
    />
  );
}
