import type { LucideIcon } from "lucide-react";
import type { PokemonCard } from "../../../types/pokemon";
import { getCustomColors, type CustomColors } from "../../../utils/customStylings";
import "./CardFeatureHeader.scss";

type CardFeatureHeaderProps = {
  card: PokemonCard;
  cardNumber?: string;
  color: CustomColors;
  icon: LucideIcon;
  label: string;
  loading?: boolean;
};

function formatCardNumber(card: PokemonCard, cardNumber?: string) {
  const number = cardNumber ?? card.number;
  if (!number || number.includes("/") || card.set?.printedTotal == null) return number;

  const total = String(card.set.printedTotal);
  const paddedNumber = /^\d+$/.test(number)
    ? number.padStart(total.length, "0")
    : number;
  return `${paddedNumber}/${total}`;
}

export function CardFeatureHeader({
  card,
  cardNumber,
  color,
  icon: Icon,
  label,
  loading,
}: CardFeatureHeaderProps) {
  const displayedNumber = formatCardNumber(card, cardNumber);
  const metadata = [
    displayedNumber && <span className="card-feature-header__number">{displayedNumber}</span>,
    card.set?.name && <span>{card.set.name}</span>,
  ].filter(Boolean);

  return (
    <header
      className="card-feature-header"
      style={getCustomColors(color)}
    >
      <span className="card-feature-header__label">
        {loading && <span className="card-feature-header__spinner" aria-hidden="true" />}
        <Icon aria-hidden="true" />
        {label}
      </span>
      <div className="card-feature-header__identity">
        <h2>{card.name}</h2>
        {metadata.length > 0 && (
          <div className="card-feature-header__metadata">
            {metadata.map((item, index) => (
              <span className="card-feature-header__metadata-item" key={index}>
                {index > 0 && <i aria-hidden="true">•</i>}
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
