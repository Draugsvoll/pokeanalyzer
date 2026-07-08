import BaseCard from "../basecard/BaseCard";
import { useNavigate } from "react-router-dom";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";

type PokemonCardProps = {
  card: PokemonCardType;
};

export function PokemonCard({ card }: PokemonCardProps) {
  const navigate = useNavigate();
  const handleClick = () => {
    navigateToPokemonCard(navigate, card);
  };

  return (
    <BaseCard onClick={handleClick}>
      <img src={card.images?.small} alt={card.name} />
      <h2>{card.name}</h2>
      <p>{getTcgPlayerMarketPrice(card.tcgplayer?.prices) ?? 0} NOK</p>
    </BaseCard>
  );
}