import { SELECTED_POKEMON_CACHE_KEY } from "../../constants/cache";
import BaseCard from "../basecard/BaseCard";
import { useNavigate } from "react-router-dom";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";

type PokemonCardProps = {
  card: PokemonCardType;
};

export function PokemonCard({ card }: PokemonCardProps) {
  const navigate = useNavigate();
  const handleClick = () => {
    localStorage.setItem(SELECTED_POKEMON_CACHE_KEY, JSON.stringify(card));
    navigate(`/card/${card.id}`);
  };

  return (
    <BaseCard onClick={handleClick}>
      <img src={card.images?.small} alt={card.name} />
      <h2>{card.name}</h2>
      <p>{getTcgPlayerMarketPrice(card.tcgplayer?.prices) ?? 0} NOK</p>
    </BaseCard>
  );
}