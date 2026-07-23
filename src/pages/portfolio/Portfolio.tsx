import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { ConfirmPopover } from "../../components/confirmPopover/ConfirmPopover";
import { GridView } from "../../components/gridView/GridView";
import { PokemonCard } from "../../components/pokemonCard/PokemonCard";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { resolveCardPriceOption } from "../../utils/pokemonPricing";
import "./Portfolio.scss";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function cardQuantity(card: PokemonCardType) {
  const quantity = Number(card.quantity ?? 1);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

export default function Portfolio() {
  const { user, loading: authLoading } = useAuth();
  const { portfolio, loadingPortfolio } = usePortfolioCache();
  const {
    removePokemonFromPortfolio,
    updatePokemonQuantity,
    updatePokemonPriceSource,
  } = usePokemonPortfolio();
  const [updatingQuantityId, setUpdatingQuantityId] = useState<string | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState<{
    cardId: string;
    quantity: number;
  } | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    cardId: string;
    cardName: string;
  } | null>(null);
  const [pendingPriceSource, setPendingPriceSource] = useState<{
    cardId: string;
    priceSource: string;
  } | null>(null);
  const [updatingPriceSourceId, setUpdatingPriceSourceId] = useState<string | null>(
    null,
  );

  // Sum each card's selected price × quantity (USD / EUR kept separate)
  const { totalUsd, totalEur } = useMemo(() => {
    let totalUsd = 0;
    let totalEur = 0;

    for (const card of portfolio) {
      const option = resolveCardPriceOption(card, card.priceSource);
      if (!option) continue;

      const line = option.price * cardQuantity(card);
      if (option.currencySymbol === "$") totalUsd += line;
      else totalEur += line;
    }

    return { totalUsd, totalEur };
  }, [portfolio]);

  const requestQuantityChange = (card: PokemonCardType, amount: number) => {
    if (updatingQuantityId) return;

    const currentQuantity = pendingQuantity?.cardId === card.id
      ? pendingQuantity.quantity
      : card.quantity ?? 1;
    const nextQuantity = currentQuantity + amount;
    if (nextQuantity < 1) return;

    setPendingQuantity({ cardId: card.id, quantity: nextQuantity });
  };

  const confirmQuantityChange = async () => {
    if (!pendingQuantity) return;

    setUpdatingQuantityId(pendingQuantity.cardId);
    await updatePokemonQuantity(pendingQuantity.cardId, pendingQuantity.quantity);
    setUpdatingQuantityId(null);
    setPendingQuantity(null);
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;

    await removePokemonFromPortfolio(pendingRemoval.cardId, false);
    setPendingRemoval(null);
  };

  const confirmPriceSourceChange = async () => {
    if (!pendingPriceSource) return;

    setUpdatingPriceSourceId(pendingPriceSource.cardId);
    const ok = await updatePokemonPriceSource(
      pendingPriceSource.cardId,
      pendingPriceSource.priceSource,
    );
    setUpdatingPriceSourceId(null);
    if (ok) setPendingPriceSource(null);
  };

  useEffect(() => {
    if (!pendingQuantity && !pendingRemoval && !pendingPriceSource) return;

    const cancelWhenClickingOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".ui-confirm-popover, .portfolio__quantity-control, .portfolio__quantity-display, .pokemon-card__source, .pokemon-card__source-flyout",
        )
      ) return;
      setPendingQuantity(null);
      setPendingRemoval(null);
      setPendingPriceSource(null);
    };

    document.addEventListener("pointerdown", cancelWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", cancelWhenClickingOutside);
  }, [pendingQuantity, pendingRemoval, pendingPriceSource]);

  if (authLoading || loadingPortfolio) {
    return <main className="portfolio portfolio--status ui-render-fade" key="loading"><h1>Loading collection...</h1></main>;
  }

  if (!user) {
    return <main className="portfolio portfolio--status ui-render-fade" key="logged-out"><h1>Log in to view your collection</h1></main>;
  }

  return (
    <main className="portfolio ui-render-fade" key="collection">
      <header className="portfolio__header">
        <div>
          <span className="portfolio__eyebrow">Portfolio</span>
          <h1>My collection</h1>
        </div>
        {portfolio.length > 0 && (
          <div className="portfolio__total" aria-live="polite">
            <span className="portfolio__total-label">Collection value</span>
            <div className="portfolio__total-markets">
              <div className="portfolio__total-market portfolio__total-market--usd">
                <span className="portfolio__total-market-label">TCG · USD</span>
                <strong className="portfolio__total-market-value">
                  {totalUsd > 0 ? `$${money.format(totalUsd)}` : "—"}
                </strong>
              </div>
              <div
                className="portfolio__total-market-divider"
                aria-hidden="true"
              />
              <div className="portfolio__total-market portfolio__total-market--eur">
                <span className="portfolio__total-market-label">
                  Cardmarket · EUR
                </span>
                <strong className="portfolio__total-market-value">
                  {totalEur > 0 ? `€${money.format(totalEur)}` : "—"}
                </strong>
              </div>
            </div>
          </div>
        )}
      </header>

      {portfolio.length === 0 ? (
        <div className="portfolio__empty">
          <h2>No saved cards yet</h2>
          <p>Cards you add to your portfolio will appear here.</p>
        </div>
      ) : (
        <GridView>
          {portfolio.map((card) => (
            <div
              key={card.id}
              className={`portfolio__card${
                pendingQuantity?.cardId === card.id ||
                pendingRemoval?.cardId === card.id ||
                pendingPriceSource?.cardId === card.id
                  ? " portfolio__card--confirming"
                  : ""
              }`}
            >
              <div className="portfolio__card-main">
                <PokemonCard
                  card={card}
                  quantity={card.quantity}
                  selectedPriceOptionId={card.priceSource ?? null}
                  pendingPriceOptionId={
                    pendingPriceSource?.cardId === card.id
                      ? pendingPriceSource.priceSource
                      : null
                  }
                  confirmingPriceOption={updatingPriceSourceId === card.id}
                  onPriceOptionChange={(optionId) => {
                    if (optionId === (card.priceSource ?? null)) {
                      setPendingPriceSource(null);
                      return;
                    }
                    setPendingPriceSource({
                      cardId: card.id,
                      priceSource: optionId,
                    });
                  }}
                  onConfirmPriceOption={confirmPriceSourceChange}
                  onCancelPriceOption={() => setPendingPriceSource(null)}
                />
              </div>
              <div className="portfolio__card-actions ui-fade">
                <div className="portfolio__quantity-control">
                  <button
                    type="button"
                    className="portfolio__quantity-button"
                    aria-label={`Increase ${card.name} quantity`}
                    disabled={updatingQuantityId === card.id}
                    onClick={() => requestQuantityChange(card, 1)}
                  >
                    <ChevronUp aria-hidden="true" />
                  </button>
                </div>
                <div className="portfolio__quantity-display">
                  <input
                    className="portfolio__quantity"
                    aria-label={`${card.name} quantity`}
                    type="number"
                    min="1"
                    readOnly
                    value={pendingQuantity?.cardId === card.id
                      ? pendingQuantity.quantity
                      : card.quantity ?? 1}
                  />
                  {pendingQuantity?.cardId === card.id && (
                    <ConfirmPopover
                      className="portfolio__quantity-confirm"
                      confirmLabel="Update"
                      aria-label="Confirm quantity change"
                      confirmDisabled={
                        pendingQuantity.quantity === (card.quantity ?? 1)
                      }
                      confirming={updatingQuantityId === card.id}
                      onConfirm={() => {
                        void confirmQuantityChange();
                      }}
                      onCancel={() => setPendingQuantity(null)}
                    />
                  )}
                </div>
                <div className="portfolio__quantity-control">
                  <button
                    type="button"
                    className="portfolio__quantity-button"
                    aria-label={`Decrease ${card.name} quantity`}
                    disabled={
                      (pendingQuantity?.cardId === card.id
                        ? pendingQuantity.quantity
                        : card.quantity ?? 1) <= 1 || updatingQuantityId === card.id
                    }
                    onClick={() => requestQuantityChange(card, -1)}
                  >
                    <ChevronDown aria-hidden="true" />
                  </button>
                </div>
                <div className="portfolio__remove-control">
                  <button
                    type="button"
                    className="portfolio__remove-card"
                    aria-label={`Remove ${card.name} from portfolio`}
                    title="Remove from portfolio"
                    onClick={() => setPendingRemoval({ cardId: card.id, cardName: card.name })}
                  >
                    <X aria-hidden="true" />
                  </button>
                  {pendingRemoval?.cardId === card.id && (
                    <ConfirmPopover
                      className="portfolio__quantity-confirm"
                      label="Delete?"
                      confirmLabel="OK"
                      aria-label="Confirm card removal"
                      onConfirm={() => {
                        void confirmRemoval();
                      }}
                      onCancel={() => setPendingRemoval(null)}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </GridView>
      )}
    </main>
  );
}
