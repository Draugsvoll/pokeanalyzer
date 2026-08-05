import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Star, TriangleAlert, X } from "lucide-react";
import { ConfirmPopover } from "../confirmPopover/ConfirmPopover";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import type {
  PortfolioCard,
  PortfolioPriceSnapshot,
} from "../../types/portfolio";
import { formatDateStamp } from "../../utils/formatDateStamp";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import {
  getCardPriceSourceLabel,
  getHistoricalPriceForOption,
  listCardPriceOptions,
  pickDefaultCardPriceOption,
  type CardPriceOption,
  type CardPriceSource,
} from "../../utils/pokemonPricing";
import "./PokemonCardView.scss";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type PokemonCardViewProps = {
  card: PokemonCardType;
  priceSource?: CardPriceSource;
  /** Saved selection (controlled). Do not pass a pending id here. */
  selectedPriceOptionId?: string | null;
  /** Fires when user picks a different radio - parent should open confirm only. */
  onPriceOptionChange?: (optionId: string) => void;
  /** Pending option waiting for confirm (does not change displayed price yet). */
  pendingPriceOptionId?: string | null;
  onConfirmPriceOption?: () => void | Promise<void>;
  onCancelPriceOption?: () => void;
  confirmingPriceOption?: boolean;
  lockPriceSource?: boolean;
  showPriceSourcePicker?: boolean;
  showRarityBadge?: boolean;
  comparisonPriceSnapshot?: PortfolioPriceSnapshot | null;
  showPriceWarning?: boolean;
  onPortfolioChanged?: (saved: boolean) => void;
};

function formatPriceChange(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(1)}%`;
}

export function getRarityBadgeClassName(rarity?: string | null) {
  const value = rarity?.toLowerCase() ?? "";
  let family = "rare";

  if (!value.trim()) {
    family = "unknown";
  } else if (value.includes("common") && !value.includes("uncommon")) {
    family = "common";
  } else if (value.includes("uncommon")) {
    family = "uncommon";
  } else if (value.includes("promo")) {
    family = "promo";
  } else if (
    value.includes("secret") ||
    value.includes("hyper") ||
    value.includes("shiny")
  ) {
    family = "secret";
  } else if (
    value.includes("ultra") ||
    value.includes("double") ||
    value.includes("illustration")
  ) {
    family = "ultra";
  } else if (
    value.includes("amazing") ||
    value.includes("prism") ||
    value.includes("radiant") ||
    value.includes("ace spec") ||
    value.includes("legend")
  ) {
    family = "special";
  }

  return `card-rarity-badge card-rarity-badge--${family}`;
}

export function PokemonCardView({
  card,
  priceSource = "tcgplayer",
  selectedPriceOptionId,
  onPriceOptionChange,
  pendingPriceOptionId = null,
  onConfirmPriceOption,
  onCancelPriceOption,
  confirmingPriceOption = false,
  lockPriceSource = false,
  showPriceSourcePicker = false,
  showRarityBadge = true,
  comparisonPriceSnapshot,
  showPriceWarning = false,
  onPortfolioChanged,
}: PokemonCardViewProps) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { savePokemonToPortfolio, removePokemonFromPortfolio } =
    usePokemonPortfolio();
  const { isCardSaved, loadingPortfolioReferences, portfolioReferencesError } =
    usePortfolioCache();
  const sourcePanelId = useId();
  const pricingRef = useRef<HTMLDivElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [internalOptionId, setInternalOptionId] = useState<string | null>(null);
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);

  const isControlled = selectedPriceOptionId !== undefined;
  const requiresConfirm = Boolean(onConfirmPriceOption);
  const priceOptions = useMemo(() => listCardPriceOptions(card), [card]);
  const visiblePriceOptions = useMemo(() => {
    if (!lockPriceSource) return priceOptions;

    return priceOptions.filter((option) => option.source === priceSource);
  }, [lockPriceSource, priceOptions, priceSource]);
  const defaultPriceOption = lockPriceSource
    ? visiblePriceOptions[0]
    : pickDefaultCardPriceOption(priceOptions, priceSource);
  const validInternalOptionId =
    internalOptionId &&
    visiblePriceOptions.some((option) => option.id === internalOptionId)
      ? internalOptionId
      : (defaultPriceOption?.id ?? null);
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
    visiblePriceOptions.find((option) => option.id === selectedOptionId) ??
    defaultPriceOption;
  const displayedPrice = activeOption?.price;
  const comparisonPrice =
    activeOption && comparisonPriceSnapshot
      ? getHistoricalPriceForOption(activeOption, comparisonPriceSnapshot)
      : undefined;
  const priceChangePercent =
    displayedPrice != null && comparisonPrice != null
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
  const showPriceChange = comparisonPriceSnapshot !== undefined;
  const currencySymbol =
    activeOption?.currencySymbol ?? (priceSource === "tcgplayer" ? "$" : "€");
  const variantLabel = activeOption?.label;
  const canPickSource = showPriceSourcePicker && visiblePriceOptions.length > 0;
  const cardIsSaved = isCardSaved(card.id);
  const portfolioBusy =
    updatingPortfolio || (Boolean(authUser) && loadingPortfolioReferences);
  const portfolioUnavailable =
    Boolean(authUser) && Boolean(portfolioReferencesError);

  async function handlePortfolioToggle() {
    if (updatingPortfolio || loadingPortfolioReferences || portfolioUnavailable) {
      return;
    }

    setUpdatingPortfolio(true);
    try {
      const success = cardIsSaved
        ? await removePokemonFromPortfolio(card.id, false)
        : await savePokemonToPortfolio(card);

      if (!success) return;
      onPortfolioChanged?.(!cardIsSaved);
    } finally {
      setUpdatingPortfolio(false);
    }
  }

  const selectOption = (optionId: string) => {
    if (optionId === activeOption?.id) {
      onCancelPriceOption?.();
      return;
    }

    if (requiresConfirm) {
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
    <div className="pokemon-card-view">
      <div
        className={`pokemon-card-view__card${
          sourceOpen ? " pokemon-card-view__card--source-open" : ""
        }`}
        onClick={handleCardClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleCardClick();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {authUser && (
          <button
            type="button"
            className={`pokemon-card__portfolio-toggle${
              cardIsSaved ? " is-saved" : ""
            }`}
            aria-label={
              portfolioUnavailable
                ? "Portfolio is unavailable"
                : portfolioBusy
                  ? "Updating portfolio"
                  : cardIsSaved
                    ? "Remove from portfolio"
                    : "Add to portfolio"
            }
            aria-pressed={cardIsSaved}
            aria-busy={portfolioBusy}
            disabled={portfolioBusy || portfolioUnavailable}
            title={
              portfolioUnavailable
                ? "Portfolio is unavailable"
                : portfolioBusy
                  ? "Updating portfolio"
                  : cardIsSaved
                    ? "Remove from portfolio"
                    : "Add to portfolio"
            }
            onClick={(event) => {
              event.stopPropagation();
              void handlePortfolioToggle();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {portfolioBusy ? (
              <span className="app-btn__spinner" aria-hidden="true" />
            ) : (
              <Star aria-hidden="true" />
            )}
          </button>
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

          {showRarityBadge || variantLabel?.trim() ? (
            <div className="pokemon-card__metadata-row">
              {showRarityBadge && (
                <span
                  className={`pokemon-card__rarity ${getRarityBadgeClassName(card.rarity)} badge-small`}
                  title={card.rarity ?? "Rarity unavailable"}
                >
                  {card.rarity ?? "N/A"}
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
                    : "-"}
                </span>
                {showPriceWarning && (
                  <span
                    className="pokemon-card__price-warning"
                    role="img"
                    aria-label="Potentially unstable price"
                    title="Potentially unstable price"
                  >
                    <TriangleAlert aria-hidden="true" />
                  </span>
                )}
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
                      -
                    </span>
                  ))}
              </div>
            </div>

            {showPriceSourcePicker && visiblePriceOptions.length > 0 && (
              <div className="pokemon-card__variant-row">
                <div className="pokemon-card__source">
                  <button
                    type="button"
                    className={`pokemon-card__source-toggle${
                      sourceOpen ? " is-open" : ""
                    }`}
                    aria-expanded={sourceOpen}
                    aria-controls={sourcePanelId}
                    onClick={() => {
                      if (sourceOpen) closeSource();
                      else setSourceOpen(true);
                    }}
                  >
                    <span className="pokemon-card__source-label">Source</span>
                    <ChevronDown
                      className="pokemon-card__source-chevron"
                      aria-hidden="true"
                    />
                  </button>

                  {sourceOpen && (
                    <div className="pokemon-card__source-flyout ui-render-fade">
                      <div
                        id={sourcePanelId}
                        className="pokemon-card__source-panel ui-popover-surface"
                        role="radiogroup"
                        aria-label="Price source"
                      >
                        {visiblePriceOptions.map((option) => {
                          const inputId = `${sourcePanelId}-${option.id}`;
                          const checked = option.id === activeOption?.id;
                          const isPending =
                            option.id === pendingPriceOptionId;
                          const pretext = getCardPriceSourceLabel(
                            option.source,
                          );

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
                                {money.format(option.price)}
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
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

type PokemonCardPortfolioViewProps = PokemonCardViewProps & {
  card: PortfolioCard;
  quantity?: number;
  onQuantityUpdated?: (cardId: string, quantity: number) => void;
  onRemoved?: (cardId: string) => void;
  onPriceSourceUpdated?: (
    cardId: string,
    priceSource: CardPriceSource,
    priceKey: string,
  ) => void;
};

export function PokemonCardPortfolioView({
  card,
  quantity = card.quantity ?? 1,
  onQuantityUpdated,
  onRemoved,
  onPriceSourceUpdated,
  onPortfolioChanged,
  ...cardViewProps
}: PokemonCardPortfolioViewProps) {
  const {
    removePokemonFromPortfolio,
    updatePokemonPriceSource,
    updatePokemonQuantity,
  } =
    usePokemonPortfolio();
  const activePriceSource = cardViewProps.priceSource ?? "tcgplayer";
  const savedPriceKey = card.priceSources?.[activePriceSource] ?? null;
  const [displayedQuantity, setDisplayedQuantity] = useState(quantity);
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);
  const [updatingQuantity, setUpdatingQuantity] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const [updatingRemoval, setUpdatingRemoval] = useState(false);
  const [pendingPriceOptionId, setPendingPriceOptionId] = useState<
    string | null
  >(null);
  const [updatingPriceOption, setUpdatingPriceOption] = useState(false);

  useEffect(() => {
    setDisplayedQuantity(quantity);
    setPendingQuantity(null);
    setPendingRemoval(false);
    setPendingPriceOptionId(null);
  }, [activePriceSource, card.id, quantity]);

  const requestQuantityChange = (amount: number) => {
    if (updatingQuantity) return;

    const currentQuantity = pendingQuantity ?? displayedQuantity;
    const nextQuantity = currentQuantity + amount;
    if (nextQuantity < 1) return;

    setPendingQuantity(nextQuantity);
  };

  const confirmQuantityChange = async () => {
    if (pendingQuantity == null) return;

    setUpdatingQuantity(true);
    try {
      const updated = await updatePokemonQuantity(card.id, pendingQuantity);
      if (!updated) return;

      setDisplayedQuantity(pendingQuantity);
      onQuantityUpdated?.(card.id, pendingQuantity);
      setPendingQuantity(null);
    } finally {
      setUpdatingQuantity(false);
    }
  };

  const confirmRemoval = async () => {
    setUpdatingRemoval(true);
    try {
      const removed = await removePokemonFromPortfolio(card.id, false);
      if (!removed) return;

      onRemoved?.(card.id);
      setPendingRemoval(false);
    } finally {
      setUpdatingRemoval(false);
    }
  };

  const confirmPriceOptionChange = async () => {
    if (!pendingPriceOptionId) return;

    const [source, priceKey] = pendingPriceOptionId.split(":");
    if (source !== activePriceSource || !priceKey) {
      setPendingPriceOptionId(null);
      return;
    }

    setUpdatingPriceOption(true);
    try {
      const updated = await updatePokemonPriceSource(
        card.id,
        activePriceSource,
        priceKey,
      );
      if (!updated) return;

      onPriceSourceUpdated?.(card.id, activePriceSource, priceKey);
      setPendingPriceOptionId(null);
    } finally {
      setUpdatingPriceOption(false);
    }
  };

  return (
    <div
      className={`pokemon-card-portfolio-view${
        pendingQuantity != null || pendingRemoval
          ? " pokemon-card-portfolio-view--confirming"
          : ""
      }`}
    >
      {displayedQuantity > 1 && (
        <span
          className="pokemon-card-portfolio-view__quantity-badge badge-small"
          aria-label={`${displayedQuantity} copies in collection`}
        >
          x{displayedQuantity}
        </span>
      )}

      <PokemonCardView
        card={card}
        {...cardViewProps}
        showPriceSourcePicker
        selectedPriceOptionId={
          savedPriceKey ? `${activePriceSource}:${savedPriceKey}` : null
        }
        pendingPriceOptionId={pendingPriceOptionId}
        onPriceOptionChange={setPendingPriceOptionId}
        onConfirmPriceOption={confirmPriceOptionChange}
        onCancelPriceOption={() => setPendingPriceOptionId(null)}
        confirmingPriceOption={updatingPriceOption}
        onPortfolioChanged={(saved) => {
          onPortfolioChanged?.(saved);
          if (!saved) onRemoved?.(card.id);
        }}
      />

      <div
        className="pokemon-card-portfolio-view__actions ui-fade"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="pokemon-card-portfolio-view__quantity-button"
          aria-label={`Increase ${card.name} quantity`}
          disabled={updatingQuantity}
          onClick={() => requestQuantityChange(1)}
        >
          <ChevronUp aria-hidden="true" />
        </button>

        <div className="pokemon-card-portfolio-view__quantity-display">
          <input
            className="pokemon-card-portfolio-view__quantity"
            aria-label={`${card.name} quantity`}
            type="number"
            min="1"
            readOnly
            value={pendingQuantity ?? displayedQuantity}
          />
          {pendingQuantity != null && (
            <ConfirmPopover
              className="pokemon-card-portfolio-view__quantity-confirm"
              label="Update?"
              confirmLabel="OK"
              aria-label="Confirm quantity change"
              confirmDisabled={pendingQuantity === displayedQuantity}
              confirming={updatingQuantity}
              onConfirm={() => {
                void confirmQuantityChange();
              }}
              onCancel={() => setPendingQuantity(null)}
            />
          )}
        </div>

        <button
          type="button"
          className="pokemon-card-portfolio-view__quantity-button"
          aria-label={`Decrease ${card.name} quantity`}
          disabled={
            (pendingQuantity ?? displayedQuantity) <= 1 || updatingQuantity
          }
          onClick={() => requestQuantityChange(-1)}
        >
          <ChevronDown aria-hidden="true" />
        </button>

        <div className="pokemon-card-portfolio-view__remove-control">
          <button
            type="button"
            className="pokemon-card-portfolio-view__remove-card"
            aria-label={`Remove ${card.name} from portfolio`}
            title="Remove from portfolio"
            onClick={() => setPendingRemoval(true)}
          >
            <X aria-hidden="true" />
          </button>
          {pendingRemoval && (
            <ConfirmPopover
              className="pokemon-card-portfolio-view__quantity-confirm"
              label="Delete?"
              confirmLabel="OK"
              aria-label="Confirm card removal"
              confirming={updatingRemoval}
              onConfirm={() => {
                void confirmRemoval();
              }}
              onCancel={() => setPendingRemoval(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
