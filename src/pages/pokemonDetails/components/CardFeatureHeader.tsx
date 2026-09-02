import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PokemonCard } from "../../../types/pokemon";
import {
  getCustomColors,
  type CustomColors,
} from "../../../utils/customStylings";
import Button from "../../../components/button/Button";
import { formatCardNumber } from "../../../../shared/formatCardNumber";
import "./CardFeatureHeader.scss";

export const CARD_FEATURE_HEADER_ACTION_LABEL = "Open";

type CardFeatureHeaderProps = {
  card: PokemonCard;
  cardNumber?: string;
  color: CustomColors;
  icon: LucideIcon;
  label: string;
  actionLabel?: string;
  actionCostLabel?: string;
  actionLoading?: boolean;
  actionDisabled?: boolean;
  actionHidden?: boolean;
  onAction?: () => void;
  authActions?: ReactNode;
};

export function CardFeatureHeader({
  card,
  cardNumber,
  color,
  icon: Icon,
  label,
  actionLabel,
  actionCostLabel = "(1 credit)",
  actionLoading,
  actionDisabled,
  actionHidden,
  onAction,
  authActions,
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
      {authActions ? (
        <div className="card-feature-header__auth">{authActions}</div>
      ) : (
        onAction &&
        !actionHidden && (
          <div className="card-feature-header__action">
            <Button
              fill="solid"
              fitContent
              style={getCustomColors(color)}
              onClick={onAction}
              disabled={actionDisabled || actionLoading}
              aria-busy={actionLoading}
              aria-label={
                actionLoading ? `Loading ${actionLabel ?? label}` : undefined
              }
            >
              {actionLoading ? (
                <span className="app-btn__spinner" aria-hidden="true" />
              ) : (
                (actionLabel ?? label)
              )}
            </Button>
            <span className="card-feature-header__action-cost">
              {actionCostLabel}
            </span>
          </div>
        )
      )}
    </header>
  );
}
