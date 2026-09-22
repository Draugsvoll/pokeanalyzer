import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { ConfirmPopover } from "../confirmPopover/ConfirmPopover";
import { Badge } from "../ui/Badge";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import type {
  PortfolioCard,
  PortfolioPriceSnapshot,
} from "../../types/portfolio";
import { formatCardNumber } from "../../../shared/formatCardNumber";
import { formatDateStamp } from "../../utils/formatDateStamp";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";
import "./PokemonCardView.scss";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function currencySymbolFor(currency: string) {
  try {
    return (
      new Intl.NumberFormat("en-US", {
        currency,
        currencyDisplay: "narrowSymbol",
        style: "currency",
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? `${currency} `
    );
  } catch {
    return `${currency} `;
  }
}

export type PokemonCardViewProps = {
  card: PokemonCardType;
  comparisonPriceSnapshot?: PortfolioPriceSnapshot | null;
  hidePortfolioButtonUntilHover?: boolean;
  marketDisplay?: {
    changeLabel?: string;
    changePercent?: number;
    currency: string;
    marketLabel?: string;
    price?: number;
    priceLabel?: string;
    primaryText?: string;
  };
  onPortfolioChanged?: (saved: boolean) => void;
  priceChangeLabel?: string;
};

function formatPriceChange(value: number) {
  if (value === 0) return "0%";
  return `${Math.abs(value).toFixed(1)}%`;
}

function priceChangeDirectionLabel(tone: "up" | "down" | "flat") {
  if (tone === "up") return "Price increased";
  if (tone === "down") return "Price decreased";
  return "Price unchanged";
}

function getVariantBadgeAccent(variant?: string) {
  const value = variant?.trim().toLowerCase().replaceAll("_", " ") ?? "";

  if (value.includes("1st edition") && value.includes("holo")) {
    return "orange" as const;
  }
  if (value.includes("1st edition")) return "yellow" as const;
  if (value.includes("reverse holo")) return "teal" as const;
  return "neutral" as const;
}

export function PokemonCardView({
  card,
  comparisonPriceSnapshot,
  hidePortfolioButtonUntilHover = false,
  marketDisplay,
  onPortfolioChanged,
  priceChangeLabel,
}: PokemonCardViewProps) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { savePokemonToPortfolio, removePokemonFromPortfolio } =
    usePokemonPortfolio();
  const { isCardSaved, loadingPortfolioReferences, portfolioReferencesError } =
    usePortfolioCache();
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const activeOption = resolvePokeTraceCardPrice(card);
  const imageSrc = card.images?.small;
  const imageAvailable = Boolean(imageSrc && failedImageSrc !== imageSrc);
  const displayedPrice = marketDisplay?.price ?? activeOption?.price;
  const comparisonPrice = comparisonPriceSnapshot?.marketPrice;
  const calculatedPriceChangePercent =
    marketDisplay?.changePercent ??
    (displayedPrice != null && comparisonPrice != null
      ? ((displayedPrice - comparisonPrice) / comparisonPrice) * 100
      : null);
  const normalizedPriceChangePercent = calculatedPriceChangePercent;
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
    marketDisplay?.changePercent != null || comparisonPriceSnapshot != null;
  const priceChangeTitle =
    marketDisplay?.changeLabel ??
    priceChangeLabel ??
    (comparisonPriceSnapshot
      ? `Change since ${formatDateStamp(comparisonPriceSnapshot.recordedAt)}`
      : "Price change");
  const displayedCurrency =
    marketDisplay?.currency ??
    activeOption?.currency ??
    card.pokeTrace.currency;
  const displayedCurrencySymbol = marketDisplay
    ? currencySymbolFor(displayedCurrency)
    : (activeOption?.currencySymbol ?? currencySymbolFor(displayedCurrency));
  const printedCardNumber = formatCardNumber(card);
  const variantName = card.pokeTrace.variant?.trim().replaceAll("_", " ");
  const variantAccent = getVariantBadgeAccent(card.pokeTrace.variant);
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

  const handleCardClick = () => {
    navigateToPokemonCard(navigate, card);
  };

  return (
    <div className="pokemon-card-view">
      <div
        className={[
          "pokemon-card-view__card",
          hidePortfolioButtonUntilHover
            ? "pokemon-card-view__card--hide-portfolio-button-until-hover"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          aria-label={`Open ${card.name}`}
          className="pokemon-card__open"
          onClick={handleCardClick}
          title={[card.name, card.set?.name, variantName]
            .filter(Boolean)
            .join(" · ")}
          type="button"
        />
        {authUser && (
          <button
            type="button"
            className={`portfolio-toggle-button pokemon-card__portfolio-toggle${
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
            onClick={() => {
              void handlePortfolioToggle();
            }}
          >
            {portfolioBusy ? (
              <span className="app-btn__spinner" aria-hidden="true" />
            ) : (
              <Star aria-hidden="true" />
            )}
          </button>
        )}

        <div className="pokemon-card__image">
          {imageAvailable ? (
            <img
              src={imageSrc}
              alt=""
              onError={() => setFailedImageSrc(imageSrc ?? null)}
            />
          ) : (
            <span
              aria-label="Card image unavailable"
              className="pokemon-card__image-placeholder"
              role="img"
            />
          )}
        </div>

        <div className="pokemon-card__content">
          <div className="pokemon-card__identity">
            <div className="pokemon-card__name-row">
              <h2 className="pokemon-card__name" title={card.name}>
                {card.name}
              </h2>
            </div>
            <div className="pokemon-card__metadata-row">
              {printedCardNumber && (
                <span
                  className="pokemon-card__number"
                  title={`Card number ${printedCardNumber}`}
                >
                  {printedCardNumber}
                </span>
              )}
              <span className="pokemon-card__set" title={card.set?.name}>
                {card.set?.name ?? "Unknown set"}
              </span>
            </div>
            {variantName && (
              <div className="pokemon-card__variant-row">
                <span className="pokemon-card__variant">
                  <Badge accent={variantAccent} size="sm" title={variantName}>
                    {variantName}
                  </Badge>
                </span>
              </div>
            )}
          </div>

          <div className="pokemon-card__pricing">
            <div className="pokemon-card__price">
              <div className="pokemon-card__price-row">
                <div className="pokemon-card__price-current">
                  <span
                    className="pokemon-card__price-value"
                    title={marketDisplay?.priceLabel}
                  >
                    {marketDisplay?.primaryText ??
                      (displayedPrice != null
                        ? `${displayedCurrencySymbol}${money.format(displayedPrice)}`
                        : "-")}
                  </span>
                  {showPriceChange &&
                    (formattedPriceChange && priceChangeTone ? (
                      <span
                        className={`pokemon-card__price-change pokemon-card__price-change--${priceChangeTone}`}
                        title={priceChangeTitle}
                        aria-label={`${priceChangeDirectionLabel(priceChangeTone)} by ${formattedPriceChange}. ${priceChangeTitle}`}
                      >
                        {priceChangeTone === "up" && (
                          <span
                            aria-hidden="true"
                            className="pokemon-card__price-change-arrow"
                          />
                        )}
                        {priceChangeTone === "down" && (
                          <span
                            aria-hidden="true"
                            className="pokemon-card__price-change-arrow"
                          />
                        )}
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
                  {marketDisplay?.marketLabel && (
                    <span
                      className="pokemon-card__market-label"
                      title={marketDisplay.priceLabel}
                    >
                      {marketDisplay.marketLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
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
};

export function PokemonCardPortfolioView({
  card,
  quantity = card.quantity ?? 1,
  onQuantityUpdated,
  onRemoved,
  onPortfolioChanged,
  ...cardViewProps
}: PokemonCardPortfolioViewProps) {
  const { updatePokemonQuantity } = usePokemonPortfolio();
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);
  const [updatingQuantity, setUpdatingQuantity] = useState(false);
  const [actionsDismissed, setActionsDismissed] = useState(false);

  const requestQuantityChange = (amount: number) => {
    if (updatingQuantity) return;

    setActionsDismissed(false);
    const currentQuantity = pendingQuantity ?? quantity;
    const nextQuantity = currentQuantity + amount;
    if (nextQuantity < 1) return;

    setPendingQuantity(nextQuantity);
  };

  const cancelQuantityChange = () => {
    setPendingQuantity(null);
    setActionsDismissed(true);
  };

  const confirmQuantityChange = async () => {
    if (pendingQuantity == null) return;

    setUpdatingQuantity(true);
    try {
      const updated = await updatePokemonQuantity(card.id, pendingQuantity);
      if (!updated) return;

      onQuantityUpdated?.(card.id, pendingQuantity);
      setPendingQuantity(null);
      setActionsDismissed(true);
    } finally {
      setUpdatingQuantity(false);
    }
  };

  return (
    // Portfolio-only shell: do not restyle PokemonCardView internals here.
    <div
      className={`pokemon-card-portfolio-view${
        pendingQuantity != null
          ? " pokemon-card-portfolio-view--confirming"
          : ""
      }`}
      onMouseEnter={() => setActionsDismissed(false)}
      onMouseLeave={() => setActionsDismissed(false)}
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
        hidePortfolioButtonUntilHover
        onPortfolioChanged={(saved) => {
          onPortfolioChanged?.(saved);
          if (!saved) onRemoved?.(card.id);
        }}
      />

      {!actionsDismissed && (
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
            onPointerDown={(event) => event.stopPropagation()}
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
                label={`Quantity: ${pendingQuantity}`}
                aria-label="Confirm quantity change"
                confirmDisabled={pendingQuantity === quantity}
                confirming={updatingQuantity}
                onConfirm={() => {
                  void confirmQuantityChange();
                }}
                onCancel={cancelQuantityChange}
              />
            )}
          </div>

          <button
            type="button"
            className="pokemon-card-portfolio-view__quantity-button"
            aria-label={`Decrease ${card.name} quantity`}
            disabled={(pendingQuantity ?? quantity) <= 1 || updatingQuantity}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => requestQuantityChange(-1)}
          >
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
