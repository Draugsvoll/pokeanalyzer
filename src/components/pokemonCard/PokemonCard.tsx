import { useEffect, useId, useMemo, useRef, useState } from "react";
import BaseCard from "../basecard/BaseCard";
import { useNavigate } from "react-router-dom";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import {
  getCardPriceSourceLabel,
  listCardPriceOptions,
  pickDefaultCardPriceOption,
  type CardPriceOption,
  type CardPriceSource,
} from "../../utils/pokemonPricing";
import "./PokemonCard.scss";

type PokemonCardProps = {
  card: PokemonCardType;
  priceSource?: CardPriceSource;
  quantity?: number;
};

export function PokemonCard({
  card,
  priceSource = "tcgplayer",
  quantity = 1,
}: PokemonCardProps) {
  const navigate = useNavigate();
  const sourcePanelId = useId();
  const pricingRef = useRef<HTMLDivElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const priceOptions = useMemo(() => listCardPriceOptions(card), [card]);

  useEffect(() => {
    setSelectedOptionId((current) => {
      if (current && priceOptions.some((option) => option.id === current)) {
        return current;
      }
      return pickDefaultCardPriceOption(priceOptions, priceSource)?.id ?? null;
    });
  }, [priceOptions, priceSource]);

  useEffect(() => {
    if (!sourceOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (pricingRef.current && target && !pricingRef.current.contains(target)) {
        setSourceOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [sourceOpen]);

  const activeOption: CardPriceOption | undefined =
    priceOptions.find((option) => option.id === selectedOptionId) ??
    pickDefaultCardPriceOption(priceOptions, priceSource);

  const displayedPrice = activeOption?.price;
  const currencySymbol =
    activeOption?.currencySymbol ?? (priceSource === "tcgplayer" ? "$" : "€");
  const sourceLabel = activeOption
    ? getCardPriceSourceLabel(activeOption.source)
    : getCardPriceSourceLabel(priceSource);
  const variantLabel = activeOption?.label;
  const canPickSource = priceOptions.length > 0;

  const selectOption = (optionId: string) => {
    setSelectedOptionId(optionId);
    setSourceOpen(false);
  };

  const handleCardClick = () => {
    navigateToPokemonCard(navigate, card);
  };

  return (
    <BaseCard
      className={sourceOpen ? "base-card--source-open" : undefined}
      onClick={handleCardClick}
    >
      {quantity > 1 && (
        <span
          className="pokemon-card__quantity-badge"
          aria-label={`${quantity} copies in collection`}
        >
          ×{quantity}
        </span>
      )}
      <img src={card.images?.small} alt={card.name} />
      <div className="pokemon-card__identity">
        <h2 className="pokemon-card__name" title={card.name}>{card.name}</h2>
        <span className="pokemon-card__set" title={card.set?.name}>
          {card.set?.name ?? "Unknown set"}
        </span>
      </div>

      <div
        ref={pricingRef}
        className="pokemon-card__pricing"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="pokemon-card__price">
          <div className="pokemon-card__price-row">
            <span className="pokemon-card__price-value">
              {displayedPrice != null ? `${currencySymbol}${displayedPrice}` : "—"}
            </span>
            <span className="pokemon-card__price-variant">
              {variantLabel?.trim() ? variantLabel : "\u00A0"}
            </span>
          </div>

          <div className="pokemon-card__variant-row">
            <span
              className={`pokemon-card__price-source pokemon-card__price-source--${
                activeOption?.source ?? priceSource
              }`}
            >
              {sourceLabel}
            </span>

            {canPickSource && (
              <div className="pokemon-card__source">
                <button
                  type="button"
                  className={`pokemon-card__source-toggle${sourceOpen ? " is-open" : ""}`}
                  aria-expanded={sourceOpen}
                  aria-controls={sourcePanelId}
                  onClick={() => setSourceOpen((open) => !open)}
                >
                  <span>Source</span>
                  <span className="pokemon-card__source-chevron" aria-hidden="true">
                    {sourceOpen ? "▴" : "▾"}
                  </span>
                </button>

                {sourceOpen && (
                  <div
                    id={sourcePanelId}
                    className="pokemon-card__source-panel ui-render-fade"
                    role="radiogroup"
                    aria-label="Price source"
                  >
                    {priceOptions.map((option) => {
                      const inputId = `${sourcePanelId}-${option.id}`;
                      const checked = option.id === activeOption?.id;
                      const pretext = getCardPriceSourceLabel(option.source);

                      return (
                        <label
                          key={option.id}
                          htmlFor={inputId}
                          className={`pokemon-card__source-option${checked ? " is-selected" : ""}`}
                        >
                          <input
                            id={inputId}
                            type="radio"
                            name={`${sourcePanelId}-price`}
                            value={option.id}
                            checked={checked}
                            onChange={() => selectOption(option.id)}
                          />
                          <span className="pokemon-card__source-option-label">
                            <span
                              className={`pokemon-card__source-option-pretext pokemon-card__source-option-pretext--${option.source}`}
                            >
                              {pretext}
                            </span>
                            <span className="pokemon-card__source-option-name">
                              {option.label}
                            </span>
                          </span>
                          <span className="pokemon-card__source-option-price">
                            {option.currencySymbol}{option.price}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </BaseCard>
  );
}
