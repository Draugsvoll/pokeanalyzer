import { useEffect, useId, useMemo, useRef, useState } from "react";
import BaseCard from "../basecard/BaseCard";
import { ConfirmPopover } from "../confirmPopover/ConfirmPopover";
import { useNavigate } from "react-router-dom";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import type { PortfolioPriceSnapshot } from "../../types/portfolio";
import { formatDateStamp } from "../../utils/formatDateStamp";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import {
  getHistoricalPriceForOption,
  getCardPriceSourceLabel,
  listCardPriceOptions,
  pickDefaultCardPriceOption,
  type CardPriceOption,
  type CardPriceSource,
} from "../../utils/pokemonPricing";
import "./PokemonCard.scss";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type PokemonCardProps = {
  card: PokemonCardType;
  priceSource?: CardPriceSource;
  quantity?: number;
  /** Saved selection (controlled). Do not pass a pending id here. */
  selectedPriceOptionId?: string | null;
  /** Fires when user picks a different radio — parent should open confirm only */
  onPriceOptionChange?: (optionId: string) => void;
  /** Pending option waiting for confirm (does not change displayed price yet) */
  pendingPriceOptionId?: string | null;
  onConfirmPriceOption?: () => void | Promise<void>;
  onCancelPriceOption?: () => void;
  confirmingPriceOption?: boolean;
  showRarityBadge?: boolean;
  latestPriceSnapshot?: PortfolioPriceSnapshot | null;
  comparisonPriceSnapshot?: PortfolioPriceSnapshot | null;
};

function formatPriceChange(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

export function PokemonCard({
  card,
  priceSource = "tcgplayer",
  quantity = 1,
  selectedPriceOptionId,
  onPriceOptionChange,
  pendingPriceOptionId = null,
  onConfirmPriceOption,
  onCancelPriceOption,
  confirmingPriceOption = false,
  showRarityBadge = false,
  latestPriceSnapshot,
  comparisonPriceSnapshot,
}: PokemonCardProps) {
  const navigate = useNavigate();
  const sourcePanelId = useId();
  const pricingRef = useRef<HTMLDivElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [internalOptionId, setInternalOptionId] = useState<string | null>(null);

  const isControlled = selectedPriceOptionId !== undefined;
  const requiresConfirm = Boolean(onConfirmPriceOption);
  const priceOptions = useMemo(() => listCardPriceOptions(card), [card]);
  const validInternalOptionId =
    internalOptionId &&
    priceOptions.some((option) => option.id === internalOptionId)
      ? internalOptionId
      : (pickDefaultCardPriceOption(priceOptions, priceSource)?.id ?? null);
  const selectedOptionId = isControlled
    ? selectedPriceOptionId
    : validInternalOptionId;

  useEffect(() => {
    if (!sourceOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        pricingRef.current &&
        target &&
        !pricingRef.current.contains(target)
      ) {
        setSourceOpen(false);
        onCancelPriceOption?.();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [sourceOpen, onCancelPriceOption]);

  const activeOption: CardPriceOption | undefined =
    priceOptions.find((option) => option.id === selectedOptionId) ??
    pickDefaultCardPriceOption(priceOptions, priceSource);

  const displayedPrice = activeOption?.price;
  const latestSnapshotPrice =
    activeOption && latestPriceSnapshot
      ? getHistoricalPriceForOption(activeOption, latestPriceSnapshot)
      : undefined;
  const comparisonPrice =
    activeOption && comparisonPriceSnapshot
      ? getHistoricalPriceForOption(activeOption, comparisonPriceSnapshot)
      : undefined;
  const priceChangePercent =
    displayedPrice != null &&
    latestSnapshotPrice != null &&
    comparisonPrice != null
      ? ((displayedPrice - comparisonPrice) / comparisonPrice) * 100
      : null;
  const displayedPriceChangePercent =
    priceChangePercent != null && Math.abs(priceChangePercent) < 0.05
      ? 0
      : priceChangePercent;
  const formattedPriceChange =
    displayedPriceChangePercent == null
      ? null
      : formatPriceChange(displayedPriceChangePercent);
  const priceChangeTone =
    displayedPriceChangePercent == null
      ? null
      : displayedPriceChangePercent > 0
        ? "up"
        : displayedPriceChangePercent < 0
          ? "down"
          : "flat";
  const showPriceChange =
    latestPriceSnapshot !== undefined || comparisonPriceSnapshot !== undefined;
  const currencySymbol =
    activeOption?.currencySymbol ?? (priceSource === "tcgplayer" ? "$" : "€");
  const sourceLabel = activeOption
    ? getCardPriceSourceLabel(activeOption.source)
    : getCardPriceSourceLabel(priceSource);
  const variantLabel = activeOption?.label;
  const canPickSource = priceOptions.length > 0;

  const selectOption = (optionId: string) => {
    // Already saved selection — ignore
    if (optionId === activeOption?.id) {
      onCancelPriceOption?.();
      return;
    }

    if (requiresConfirm) {
      // Keep panel open; parent shows confirm; display stays on saved price
      onPriceOptionChange?.(optionId);
      return;
    }

    if (!isControlled) setInternalOptionId(optionId);
    onPriceOptionChange?.(optionId);
    setSourceOpen(false);
  };

  const handleCardClick = () => {
    navigateToPokemonCard(navigate, card);
  };

  const closeSource = () => {
    setSourceOpen(false);
    onCancelPriceOption?.();
  };

  return (
    <BaseCard
      className={sourceOpen ? "base-card--source-open" : undefined}
      onClick={handleCardClick}
    >
      {quantity > 1 && (
        <span
          className="pokemon-card__quantity-badge badge-small"
          aria-label={`${quantity} copies in collection`}
        >
          ×{quantity}
        </span>
      )}
      <div className="pokemon-card__image">
        <img src={card.images?.small} alt={card.name} />
      </div>
      <div className="pokemon-card__identity">
        <h2 className="pokemon-card__name" title={card.name}>
          {card.name}
        </h2>
        <div className="pokemon-card__set-row">
          <span className="pokemon-card__set" title={card.set?.name}>
            {card.set?.name ?? "Unknown set"}
          </span>
          {card.set?.series && (
            <span className="pokemon-card__series" title={card.set.series}>
              <span aria-hidden="true">•</span>
              <span className="pokemon-card__series-name">
                {card.set.series}
              </span>
            </span>
          )}
        </div>
        {(showRarityBadge && card.rarity) || variantLabel?.trim() ? (
          <div className="pokemon-card__metadata-row">
            {showRarityBadge && card.rarity && (
              <span
                className="pokemon-card__rarity card-rarity-badge badge-small"
                title={card.rarity}
              >
                {card.rarity}
              </span>
            )}
            {variantLabel?.trim() && (
              <span
                className="pokemon-card__price-variant badge-small"
                title={variantLabel}
              >
                {variantLabel}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div
        ref={pricingRef}
        className="pokemon-card__pricing"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="pokemon-card__price">
          <div className="pokemon-card__price-row">
            <div className="pokemon-card__price-current">
              <span className="pokemon-card__price-value">
                {displayedPrice != null
                  ? `${currencySymbol}${money.format(displayedPrice)}`
                  : "—"}
              </span>
              {showPriceChange &&
                (formattedPriceChange &&
                priceChangeTone &&
                comparisonPriceSnapshot ? (
                  <span
                    className={`pokemon-card__price-change pokemon-card__price-change--${priceChangeTone}`}
                    title={`Change since ${formatDateStamp(comparisonPriceSnapshot.recordedAt)}`}
                    aria-label={`${formattedPriceChange} since ${formatDateStamp(comparisonPriceSnapshot.recordedAt)}`}
                  >
                    {formattedPriceChange}
                  </span>
                ) : (
                  <span
                    className="pokemon-card__price-change pokemon-card__price-change--unavailable"
                    title="Price change unavailable"
                    aria-label="Price change unavailable"
                  >
                    —
                  </span>
                ))}
            </div>
          </div>

          <div className="pokemon-card__variant-row">
            <span
              className={`badge-small badge-small--${
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
                  onClick={() => {
                    if (sourceOpen) closeSource();
                    else setSourceOpen(true);
                  }}
                >
                  <span className="pokemon-card__source-label">Source</span>
                  <span
                    className="pokemon-card__source-chevron"
                    aria-hidden="true"
                  >
                    {sourceOpen ? "▴" : "▾"}
                  </span>
                </button>

                {sourceOpen && (
                  <div className="pokemon-card__source-flyout ui-render-fade">
                    <div
                      id={sourcePanelId}
                      className="pokemon-card__source-panel ui-popover-surface"
                      role="radiogroup"
                      aria-label="Price source"
                    >
                      {priceOptions.map((option) => {
                        const inputId = `${sourcePanelId}-${option.id}`;
                        const checked = option.id === activeOption?.id;
                        const isPending = option.id === pendingPriceOptionId;
                        const pretext = getCardPriceSourceLabel(option.source);

                        return (
                          <label
                            key={option.id}
                            htmlFor={inputId}
                            className={[
                              "pokemon-card__source-option",
                              checked ? "is-selected" : "",
                              isPending ? "is-pending" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <input
                              className="app-radio"
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
                              {option.currencySymbol}
                              {option.price}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {pendingPriceOptionId && (
                      <ConfirmPopover
                        className="pokemon-card__source-confirm"
                        label="Update?"
                        confirmLabel="OK"
                        aria-label="Confirm price source change"
                        confirming={confirmingPriceOption}
                        onConfirm={() => {
                          void (async () => {
                            await onConfirmPriceOption?.();
                            setSourceOpen(false);
                          })();
                        }}
                        onCancel={closeSource}
                      />
                    )}
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
