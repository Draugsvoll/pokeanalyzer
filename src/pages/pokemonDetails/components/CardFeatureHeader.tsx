import type { LucideIcon } from "lucide-react";
import type { PokemonCard } from "../../../types/pokemon";
import {
  getCustomColors,
  type CustomColors,
} from "../../../utils/customStylings";
import Button from "../../../components/button/Button";
import { formatCardNumber } from "../../../utils/formatCardNumber";
import "./CardFeatureHeader.scss";

export const CARD_FEATURE_HEADER_ACTION_LABEL = "Open";

type CardFeatureHeaderProps = {
  card: PokemonCard;
  cardNumber?: string;
  color: CustomColors;
  icon: LucideIcon;
  label: string;
  loading?: boolean;
  actionLabel?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  onAction?: () => void;
};

export function CardFeatureHeader({
  card,
  cardNumber,
  color,
  icon: Icon,
  label,
  loading,
  actionLabel,
  actionLoading,
  actionDisabled,
  onAction,
}: CardFeatureHeaderProps) {
  const displayedNumber = formatCardNumber(card, cardNumber);
  const metadata = [
    displayedNumber && (
      <span className="card-feature-header__number">{displayedNumber}</span>
    ),
    card.set?.name && <span>{card.set.name}</span>,
  ].filter(Boolean);

  return (
    <header
      className="card-feature-header default-container"
      style={getCustomColors(color)}
    >
      <span className="card-feature-header__label">
        {loading ? (
          <span className="card-feature-header__spinner" aria-hidden="true" />
        ) : (
          <Icon aria-hidden="true" />
        )}
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
      {onAction && (
        <Button
          fill="solid"
          fitContent
          style={getCustomColors(color)}
          onClick={onAction}
          disabled={actionDisabled || actionLoading}
          aria-busy={actionLoading}
        >
          {actionLoading ? "Loading..." : (actionLabel ?? label)}
        </Button>
      )}
    </header>
  );
}
