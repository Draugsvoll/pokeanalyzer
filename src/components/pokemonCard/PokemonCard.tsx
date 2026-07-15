import BaseCard from "../basecard/BaseCard";
import { useNavigate } from "react-router-dom";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";
import "./PokemonCard.scss";

type PokemonCardProps = {
  card: PokemonCardType;
  priceSource?: "tcgplayer" | "cardmarket";
};

export function PokemonCard({ card, priceSource = "tcgplayer" }: PokemonCardProps) {
  const navigate = useNavigate();
  const displayedPrice = priceSource === "tcgplayer"
    ? getTcgPlayerMarketPrice(card.tcgplayer?.prices)
    : card.cardmarket?.prices.trendPrice;
  const currencySymbol = priceSource === "tcgplayer" ? "$" : "€";
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
        <span>{currencySymbol}{displayedPrice ?? 0}</span>
      </p>
    </BaseCard>
  );
}
