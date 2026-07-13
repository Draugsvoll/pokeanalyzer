import BaseCard from "../basecard/BaseCard";
import { useNavigate } from "react-router-dom";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";
import "./PokemonCard.scss";

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
      <div className="pokemon-card__identity">
        <h2 className="pokemon-card__name" title={card.name}>{card.name}</h2>
        <span className="pokemon-card__set" title={card.set?.name}>{card.set?.name ?? "Unknown set"}</span>
      </div>
      <p className="pokemon-card__price">
        <span>{getTcgPlayerMarketPrice(card.tcgplayer?.prices) ?? 0}</span>
        <small>NOK</small>
      </p>
    </BaseCard>
  );
}
