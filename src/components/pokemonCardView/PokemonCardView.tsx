import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, ChevronUp, Star, X } from "lucide-react";
import {
  ConfirmPopover,
  type ConfirmPopoverCancelReason,
} from "../confirmPopover/ConfirmPopover";
import { PriceChange } from "../priceChange/PriceChange";
import { ProductCard } from "../productCard/ProductCard";
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
import {
  formatPriceChangePeriodLong,
  type PriceChangePeriod,
} from "../../../shared/priceChangePeriod";
import { formatDateStamp } from "../../utils/formatDateStamp";
import { navigateToPokemonCard } from "../../utils/pokemonCardNavigation";
import { getRarityBadgeAccent } from "../../utils/pokemonRarity";
import {
  resolveDisplayedPokeTracePriceChange,
  resolvePokeTraceCardPrice,
} from "../../utils/pokeTracePricing";
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
  comparisonPeriod?: PriceChangePeriod;
  comparisonPriceSnapshot?: PortfolioPriceSnapshot | null;
  hidePortfolioButtonUntilHover?: boolean;
  marketDisplay?: {
    changeLabel?: string;
    changePeriod?: PriceChangePeriod;
    changePercent?: number;
    condition?: string;
    currency: string;
    marketLabel?: string;
    price?: number;
    priceLabel?: string;
    primaryText?: string;
    source?: string;
  };
  onPortfolioChanged?: (saved: boolean) => void;
  priceChangeLabel?: string;
};

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
  comparisonPeriod,
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
  const imageSrc = card.image;
  const imageAvailable = Boolean(imageSrc && failedImageSrc !== imageSrc);
  const displayedPrice = marketDisplay
    ? marketDisplay.price
    : activeOption?.price;
  const displayedPriceChange = resolveDisplayedPokeTracePriceChange(card, {
    comparisonPeriod,
    comparisonPriceSnapshot,
    marketDisplay,
  });
  const { defaultSevenDayComparison } = displayedPriceChange;
  const displayedPriceChangePercent = displayedPriceChange.percent;
  const displayedPriceChangePeriod = displayedPriceChange.period;
  const showPriceChange = displayedPriceChange.show;
  const priceChangeTitle =
    marketDisplay?.changeLabel ??
    priceChangeLabel ??
    (defaultSevenDayComparison
      ? defaultSevenDayComparison.recordedAt
        ? `${formatPriceChangePeriodLong("7d")} TCGPlayer Near Mint change since ${formatDateStamp(defaultSevenDayComparison.recordedAt)}`
        : `${formatPriceChangePeriodLong("7d")} TCGPlayer Near Mint change`
      : comparisonPriceSnapshot
        ? `${comparisonPeriod ? `${formatPriceChangePeriodLong(comparisonPeriod)} change` : "Change"} since ${formatDateStamp(comparisonPriceSnapshot.recordedAt)}`
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
  const rarityName = card.rarity?.trim();
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
    <ProductCard
      className="pokemon-card-view"
      surfaceClassName={[
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

      <div className="product-card__content">
        <div className="pokemon-card__identity">
          <div className="pokemon-card__name-row">
            <h2
              className="product-card__title product-card__title--single-line pokemon-card__name"
              title={card.name}
            >
              {card.name}
            </h2>
          </div>
          <div className="product-card__metadata pokemon-card__metadata-row">
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
          {(variantName || rarityName) && (
            <div className="product-card__badges pokemon-card__badge-row">
              {variantName && (
                <span className="pokemon-card__variant">
                  <Badge accent={variantAccent} size="sm" title={variantName}>
                    {variantName}
                  </Badge>
                </span>
              )}
              {rarityName && (
                <span className="pokemon-card__rarity">
                  <Badge
                    accent={getRarityBadgeAccent(rarityName)}
                    size="sm"
                    title={rarityName}
                  >
                    <span className="pokemon-card__rarity-label">
                      {rarityName}
                    </span>
                  </Badge>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="product-card__price-row">
          <span
            className="product-card__price-value pokemon-card__price-value"
            title={marketDisplay?.priceLabel}
          >
            {marketDisplay?.primaryText ??
              (displayedPrice != null
                ? `${displayedCurrencySymbol}${money.format(displayedPrice)}`
                : "-")}
          </span>
          {showPriceChange && (
            <PriceChange
              animate
              key={`${priceChangeTitle}:${displayedPriceChangePercent}`}
              percent={displayedPriceChangePercent}
              period={displayedPriceChangePeriod}
              title={priceChangeTitle}
            />
          )}
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
    </ProductCard>
  );
}

type PokemonCardPortfolioViewProps = PokemonCardViewProps & {
  card: PortfolioCard;
  quantity?: number;
  quantityDialogOpen?: boolean;
  onQuantityDialogOpenChange?: (open: boolean) => void;
  onQuantityUpdated?: (cardId: string, quantity: number) => void;
  onRemoved?: (cardId: string) => void;
};

export function PokemonCardPortfolioView({
  card,
  quantity = card.quantity ?? 1,
  quantityDialogOpen,
  onQuantityDialogOpenChange,
  onQuantityUpdated,
  onRemoved,
  onPortfolioChanged,
  ...cardViewProps
}: PokemonCardPortfolioViewProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const quantityTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { updatePokemonQuantity } = usePokemonPortfolio();
  const [pendingQuantity, setPendingQuantity] = useState<number | null>(null);
  const [quantityControlsDismissed, setQuantityControlsDismissed] =
    useState(false);
  const [updatingQuantity, setUpdatingQuantity] = useState(false);
  const quantityDialogVisible =
    pendingQuantity != null && quantityDialogOpen !== false;

  const requestQuantityChange = (
    amount: number,
    trigger: HTMLButtonElement,
  ) => {
    if (updatingQuantity) return;

    const currentQuantity = quantityDialogVisible ? pendingQuantity : quantity;
    const nextQuantity = currentQuantity + amount;
    if (nextQuantity < 1) return;

    quantityTriggerRef.current = trigger;
    setQuantityControlsDismissed(false);
    setPendingQuantity(nextQuantity);
    onQuantityDialogOpenChange?.(true);
  };

  const cancelQuantityChange = (reason: ConfirmPopoverCancelReason) => {
    const cancelledWithKeyboard = reason === "keyboard";
    const activeElement = document.activeElement;
    if (
      !cancelledWithKeyboard &&
      activeElement instanceof HTMLElement &&
      cardRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }

    setQuantityControlsDismissed(!cancelledWithKeyboard);
    setPendingQuantity(null);
    onQuantityDialogOpenChange?.(false);

    if (cancelledWithKeyboard) {
      requestAnimationFrame(() =>
        quantityTriggerRef.current?.focus({ preventScroll: true }),
      );
    }
  };

  const confirmQuantityChange = async () => {
    if (!quantityDialogVisible) return;

    setUpdatingQuantity(true);
    try {
      const updated = await updatePokemonQuantity(card.id, pendingQuantity);
      if (!updated) return;

      onQuantityUpdated?.(card.id, pendingQuantity);
      setPendingQuantity(null);
      onQuantityDialogOpenChange?.(false);
    } finally {
      setUpdatingQuantity(false);
    }
  };

  return (
    // Portfolio-only shell: do not restyle PokemonCardView internals here.
    <div
      ref={cardRef}
      className={[
        "pokemon-card-portfolio-view",
        quantityDialogVisible && "pokemon-card-portfolio-view--confirming",
        quantityControlsDismissed &&
          "pokemon-card-portfolio-view--quantity-controls-dismissed",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerEnter={() => setQuantityControlsDismissed(false)}
    >
      {quantity > 1 && (
        <div className="pokemon-card-portfolio-view__quantity-anchor">
          <Badge
            aria-label={`${quantity} copies in collection`}
            size="sm"
            weight="strong"
          >
            ×{quantity}
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
          onClick={(event) => requestQuantityChange(1, event.currentTarget)}
        >
          <ChevronUp aria-hidden="true" />
        </button>

        <div className="pokemon-card-portfolio-view__quantity-display">
          <output
            className="pokemon-card-portfolio-view__quantity"
            aria-label={`${card.name} quantity`}
          >
            {quantityDialogVisible ? pendingQuantity : quantity}
          </output>
          {quantityDialogVisible && (
            <ConfirmPopover
              actionSize="small"
              className="pokemon-card-portfolio-view__quantity-confirm"
              aria-label="Confirm quantity change"
              cancelAriaLabel="Cancel quantity change"
              cancelLabel={<X aria-hidden="true" />}
              confirmAriaLabel="Apply quantity change"
              confirmDisabled={pendingQuantity === quantity}
              confirmLabel={<Check aria-hidden="true" />}
              confirming={updatingQuantity}
              label={`Quantity: ${pendingQuantity}`}
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
          disabled={
            (quantityDialogVisible ? pendingQuantity : quantity) <= 1 ||
            updatingQuantity
          }
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => requestQuantityChange(-1, event.currentTarget)}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
