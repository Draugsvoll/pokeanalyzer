import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Star, TriangleAlert, X } from "lucide-react";
import { ConfirmPopover } from "../confirmPopover/ConfirmPopover";
import { Badge } from "../ui/Badge";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import type {
  PortfolioCard,
  PortfolioPriceMode,
  PortfolioPriceSource,
  PortfolioPriceSnapshot,
} from "../../types/portfolio";
import { formatCardNumber } from "../../utils/formatCardNumber";
import { formatDateStamp } from "../../utils/formatDateStamp";
import { getRarityBadgeAccent } from "../../utils/pokemonRarity";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import {
  getCardPriceSourceLabel,
  getHistoricalPriceForOption,
  listCardPriceOptions,
  pickDefaultCardPriceOption,
  resolvePortfolioCardPriceOption,
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
  readOnlyPriceSources?: CardPriceSource[];
  showRarityBadge?: boolean;
  comparisonPriceSnapshot?: PortfolioPriceSnapshot | null;
  priceChangePercent?: number | null;
  priceChangeLabel?: string;
  showPriceWarning?: boolean;
  hidePortfolioButtonUntilHover?: boolean;
  onPortfolioChanged?: (saved: boolean) => void;
};

function formatPriceChange(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(1)}%`;
}

function getJustTcgOptionLabelParts(option: CardPriceOption) {
  const [printing = "", setName = ""] = option.groupKey?.split("|") ?? [];
  return {
    condition: option.conditionShortLabel ?? option.conditionLabel ?? "",
    printing,
    setName,
  };
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
  readOnlyPriceSources = [],
  showRarityBadge = true,
  comparisonPriceSnapshot,
  priceChangePercent,
  priceChangeLabel,
  showPriceWarning = false,
  hidePortfolioButtonUntilHover = false,
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
  const duplicateJustTcgGroupKeys = useMemo(() => {
    const labelCounts = new Map<string, number>();

    for (const option of visiblePriceOptions) {
      if (option.source !== "justtcg" || !option.groupKey) continue;
      const { printing, setName } = getJustTcgOptionLabelParts(option);
      const condition = option.conditionShortLabel ?? option.conditionLabel;
      const labelKey = [printing, setName, condition].filter(Boolean).join("|");
      labelCounts.set(labelKey, (labelCounts.get(labelKey) ?? 0) + 1);
    }

    return new Set(
      Array.from(labelCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([labelKey]) => labelKey),
    );
  }, [visiblePriceOptions]);
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
  const calculatedPriceChangePercent =
    displayedPrice != null && comparisonPrice != null
      ? ((displayedPrice - comparisonPrice) / comparisonPrice) * 100
      : null;
  const normalizedPriceChangePercent =
    priceChangePercent !== undefined
      ? priceChangePercent
      : calculatedPriceChangePercent;
  const displayedPriceChangePercent =
    normalizedPriceChangePercent != null &&
    Math.abs(normalizedPriceChangePercent) < 0.05
      ? 0
      : normalizedPriceChangePercent;
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
    priceChangePercent !== undefined || comparisonPriceSnapshot != null;
  const priceChangeTitle =
    priceChangeLabel ??
    (comparisonPriceSnapshot
      ? `Change since ${formatDateStamp(comparisonPriceSnapshot.recordedAt)}`
      : "Price change");
  const currencySymbol =
    activeOption?.currencySymbol ?? (priceSource === "tcgplayer" ? "$" : "€");
  const variantLabel =
    activeOption?.source === "justtcg" && activeOption.groupKey
      ? (activeOption.groupKey.split("|")[0] ?? activeOption.label)
      : activeOption?.label;
  const sourceLabel = activeOption
    ? getCardPriceSourceLabel(activeOption.source)
    : null;
  const printedCardNumber = formatCardNumber(card);
  const cardIsSaved = isCardSaved(card.id);
  const portfolioBusy =
    updatingPortfolio || (Boolean(authUser) && loadingPortfolioReferences);
  const portfolioUnavailable =
    Boolean(authUser) && Boolean(portfolioReferencesError);

  async function handlePortfolioToggle() {
    if (
      updatingPortfolio ||
      loadingPortfolioReferences ||
      portfolioUnavailable
    ) {
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

  function renderSourcePanel() {
    return (
      <>
        <div
          id={sourcePanelId}
          className="pokemon-card__source-panel ui-popover-surface"
          role="radiogroup"
          aria-label="Price source"
        >
          {visiblePriceOptions.map((option, index) => {
            const inputId = `${sourcePanelId}-${option.id}`;
            const checked = option.id === activeOption?.id;
            const isPending = option.id === pendingPriceOptionId;
            const pretext = getCardPriceSourceLabel(option.source);
            const {
              condition: optionConditionLabel,
              printing: optionPrinting,
              setName: optionSetName,
            } =
              option.source === "justtcg"
                ? getJustTcgOptionLabelParts(option)
                : {
                    condition:
                      option.conditionShortLabel ?? option.conditionLabel ?? "",
                    printing: "",
                    setName: "",
                  };
            const justTcgLabelKey = [
              optionPrinting,
              optionSetName,
              optionConditionLabel,
            ]
              .filter(Boolean)
              .join("|");
            const optionLabel =
              option.source === "justtcg" && optionPrinting
                ? [
                    optionPrinting,
                    duplicateJustTcgGroupKeys.has(justTcgLabelKey) &&
                    option.cardName
                      ? option.cardName
                      : optionSetName,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : option.label;
            const hasOptionLabel = Boolean(optionLabel.trim());
            const hasOptionDetail = Boolean(
              optionLabel.trim() || optionConditionLabel,
            );
            const readOnly = readOnlyPriceSources.includes(option.source);

            const optionContent = (
              <>
                {!readOnly && (
                  <input
                    className="app-radio"
                    id={inputId}
                    type="radio"
                    name={`${sourcePanelId}-price`}
                    value={option.id}
                    checked={checked}
                    onChange={() => selectOption(option.id)}
                  />
                )}
                <span className="pokemon-card__source-option-label">
                  <span
                    className={[
                      "pokemon-card__source-option-pretext",
                      `pokemon-card__source-option-pretext--${option.source}`,
                      hasOptionDetail ? "has-detail" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {pretext}
                  </span>
                  {hasOptionLabel && (
                    <span className="pokemon-card__source-option-name">
                      {optionLabel}
                    </span>
                  )}
                  {optionConditionLabel && (
                    <span className="pokemon-card__source-option-condition">
                      {optionConditionLabel}
                    </span>
                  )}
                </span>
                <span className="pokemon-card__source-option-price">
                  {option.currencySymbol}
                  {money.format(option.price)}
                </span>
              </>
            );

            const optionClassName = [
              "pokemon-card__source-option",
              checked ? "is-selected" : "",
              isPending ? "is-pending" : "",
              readOnly ? "is-readonly" : "",
            ]
              .filter(Boolean)
              .join(" ");

            if (readOnly) {
              return (
                <div key={`${option.id}-${index}`} className={optionClassName}>
                  {optionContent}
                </div>
              );
            }

            return (
              <label
                key={`${option.id}-${index}`}
                htmlFor={inputId}
                className={optionClassName}
              >
                {optionContent}
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
      </>
    );
  }

  const sourceFlyout = sourceOpen ? (
    <div className="pokemon-card__source-flyout">{renderSourcePanel()}</div>
  ) : null;

  return (
    <div className="pokemon-card-view">
      <div
        className={[
          "pokemon-card-view__card",
          sourceOpen ? "pokemon-card-view__card--source-open" : "",
          hidePortfolioButtonUntilHover
            ? "pokemon-card-view__card--hide-portfolio-button-until-hover"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
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
          <div className="pokemon-card__name-row">
            <h2 className="pokemon-card__name" title={card.name}>
              {card.name}
            </h2>
            {printedCardNumber && (
              <span
                className="pokemon-card__number"
                title={`Card number ${printedCardNumber}`}
              >
                {printedCardNumber}
              </span>
            )}
          </div>
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
                <Badge
                  accent={getRarityBadgeAccent(card.rarity)}
                  size="sm"
                  title={card.rarity ?? "Rarity unavailable"}
                  weight="strong"
                >
                  {card.rarity ?? "N/A"}
                </Badge>
              )}
              {variantLabel?.trim() && (
                <Badge size="sm" title={variantLabel}>
                  {variantLabel}
                </Badge>
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
                  (formattedPriceChange && priceChangeTone ? (
                    <span
                      className={`pokemon-card__price-change pokemon-card__price-change--${priceChangeTone}`}
                      title={priceChangeTitle}
                      aria-label={`${formattedPriceChange} ${priceChangeTitle.toLowerCase()}`}
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

              {showPriceSourcePicker && visiblePriceOptions.length > 0 && (
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
                    {sourceLabel && (
                      <span className="pokemon-card__source-name">
                        {sourceLabel}
                      </span>
                    )}
                    <ChevronDown
                      className="pokemon-card__source-chevron"
                      aria-hidden="true"
                    />
                  </button>

                  {sourceFlyout}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type PokemonCardPortfolioViewProps = PokemonCardViewProps & {
  card: PortfolioCard;
  priceMode: PortfolioPriceMode;
  quantity?: number;
  onQuantityUpdated?: (cardId: string, quantity: number) => void;
  onRemoved?: (cardId: string) => void;
  onPriceSourceUpdated?: (
    cardId: string,
    priceSource: PortfolioPriceSource,
    priceKey: string,
    selectForAll: boolean,
  ) => void;
};

export function PokemonCardPortfolioView({
  card,
  priceMode,
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
  } = usePokemonPortfolio();
  const resolvedPriceOption = resolvePortfolioCardPriceOption(card, priceMode);
  const activePriceSource: PortfolioPriceSource =
    resolvedPriceOption?.source ??
    (priceMode === "all" ? "justtcg" : priceMode);
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);
  const [updatingQuantity, setUpdatingQuantity] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const [updatingRemoval, setUpdatingRemoval] = useState(false);
  const [pendingPriceOptionId, setPendingPriceOptionId] = useState<
    string | null
  >(null);
  const [updatingPriceOption, setUpdatingPriceOption] = useState(false);
  const activePendingPriceOptionId =
    pendingPriceOptionId &&
    (priceMode === "all" ||
      pendingPriceOptionId.startsWith(`${activePriceSource}:`))
      ? pendingPriceOptionId
      : null;

  const requestQuantityChange = (amount: number) => {
    if (updatingQuantity) return;

    const currentQuantity = pendingQuantity ?? quantity;
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
    if (!activePendingPriceOptionId) return;

    const separatorIndex = activePendingPriceOptionId.indexOf(":");
    const source =
      separatorIndex >= 0
        ? activePendingPriceOptionId.slice(0, separatorIndex)
        : "";
    const priceKey =
      separatorIndex >= 0
        ? activePendingPriceOptionId.slice(separatorIndex + 1)
        : "";
    if (
      !priceKey ||
      (priceMode !== "all" && source !== activePriceSource) ||
      (source !== "tcgplayer" &&
        source !== "cardmarket" &&
        source !== "justtcg")
    ) {
      setPendingPriceOptionId(null);
      return;
    }

    setUpdatingPriceOption(true);
    try {
      const updated = await updatePokemonPriceSource(
        card.id,
        source,
        priceKey,
        priceMode === "all",
      );
      if (!updated) return;

      onPriceSourceUpdated?.(card.id, source, priceKey, priceMode === "all");
      setPendingPriceOptionId(null);
    } finally {
      setUpdatingPriceOption(false);
    }
  };

  return (
    // Portfolio-only shell: do not restyle PokemonCardView internals here.
    <div
      className={`pokemon-card-portfolio-view${
        pendingQuantity != null || pendingRemoval
          ? " pokemon-card-portfolio-view--confirming"
          : ""
      }`}
    >
      {quantity > 1 && (
        <div className="pokemon-card-portfolio-view__quantity-anchor">
          <Badge
            aria-label={`${quantity} copies in collection`}
            size="sm"
            weight="strong"
          >
            x{quantity}
          </Badge>
        </div>
      )}

      <PokemonCardView
        card={card}
        {...cardViewProps}
        priceSource={activePriceSource}
        lockPriceSource={priceMode !== "all"}
        readOnlyPriceSources={priceMode === "all" ? ["cardmarket"] : []}
        showPriceSourcePicker
        selectedPriceOptionId={resolvedPriceOption?.id ?? null}
        pendingPriceOptionId={activePendingPriceOptionId}
        onPriceOptionChange={setPendingPriceOptionId}
        onConfirmPriceOption={confirmPriceOptionChange}
        onCancelPriceOption={() => setPendingPriceOptionId(null)}
        confirmingPriceOption={updatingPriceOption}
        hidePortfolioButtonUntilHover
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
            value={pendingQuantity ?? quantity}
          />
          {pendingQuantity != null && (
            <ConfirmPopover
              className="pokemon-card-portfolio-view__quantity-confirm"
              label="Update?"
              confirmLabel="OK"
              aria-label="Confirm quantity change"
              confirmDisabled={pendingQuantity === quantity}
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
          disabled={(pendingQuantity ?? quantity) <= 1 || updatingQuantity}
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
