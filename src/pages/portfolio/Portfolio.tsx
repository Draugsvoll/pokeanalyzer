import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { ConfirmPopover } from "../../components/confirmPopover/ConfirmPopover";
import { GridView } from "../../components/gridView/GridView";
import { PokemonCard } from "../../components/pokemonCard/PokemonCard";
import LoginModal from "../../components/loginmodal/Loginmodal";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import { getHydratedPortfolio } from "../../services/portfolioApi";
import type { PortfolioCard } from "../../types/portfolio";
import { logClientError } from "../../utils/logClientError";
import { resolveCardPriceOption } from "../../utils/pokemonPricing";
import "./Portfolio.scss";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function cardQuantity(card: PortfolioCard) {
  const quantity = Number(card.quantity ?? 1);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

function PortfolioForCurrentUser() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { replacePortfolioReferences } = usePortfolioCache();
  const {
    removePokemonFromPortfolio,
    updatePokemonQuantity,
    updatePokemonPriceSource,
  } = usePokemonPortfolio();
  const activePortfolioRequestRef = useRef(0);
  const [portfolio, setPortfolio] = useState<PortfolioCard[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [portfolioError, setPortfolioError] = useState("");
  const [missingCardIds, setMissingCardIds] = useState<string[]>([]);
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
  const [showLoginModal, setShowLoginModal] = useState(false);

  const loadPortfolio = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++activePortfolioRequestRef.current;

      if (!user) {
        setPortfolio([]);
        setMissingCardIds([]);
        setPortfolioError("");
        setLoadingPortfolio(false);
        return;
      }

      setLoadingPortfolio(true);
      setPortfolioError("");

      try {
        const response = await getHydratedPortfolio(user.uid, signal);
        if (
          signal?.aborted ||
          requestId !== activePortfolioRequestRef.current
        ) return;
        setPortfolio(response.cards);
        setMissingCardIds(response.missingCardIds);
        replacePortfolioReferences(response.entries);
      } catch (error) {
        if (
          signal?.aborted ||
          requestId !== activePortfolioRequestRef.current
        ) return;
        logClientError("Failed to load portfolio cards", error);
        setPortfolio([]);
        setMissingCardIds([]);
        setPortfolioError(
          error instanceof Error
            ? error.message
            : "Failed to load your collection.",
        );
      } finally {
        if (
          !signal?.aborted &&
          requestId === activePortfolioRequestRef.current
        ) {
          setLoadingPortfolio(false);
        }
      }
    },
    [replacePortfolioReferences, user],
  );

  useEffect(() => {
    const controller = new AbortController();
    const initialize = window.setTimeout(() => {
      void loadPortfolio(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(initialize);
      controller.abort();
      activePortfolioRequestRef.current += 1;
    };
  }, [loadPortfolio]);

  // Sum each card's selected price × quantity (USD / EUR kept separate)
  const { totalUsd, totalEur, cardsUsd, cardsEur } = useMemo(() => {
    let totalUsd = 0;
    let totalEur = 0;
    let cardsUsd = 0;
    let cardsEur = 0;

    for (const card of portfolio) {
      const quantity = cardQuantity(card);
      const option = resolveCardPriceOption(card, card.priceSource);
      if (!option) continue;

      const line = option.price * quantity;
      if (option.currencySymbol === "$") {
        totalUsd += line;
        cardsUsd += quantity;
      } else {
        totalEur += line;
        cardsEur += quantity;
      }
    }

    return { totalUsd, totalEur, cardsUsd, cardsEur };
  }, [portfolio]);

  const requestQuantityChange = (card: PortfolioCard, amount: number) => {
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

    const { cardId, quantity } = pendingQuantity;
    setUpdatingQuantityId(cardId);
    const updated = await updatePokemonQuantity(cardId, quantity);
    setUpdatingQuantityId(null);
    if (!updated) return;

    setPortfolio((current) =>
      current.map((card) =>
        card.id === cardId ? { ...card, quantity } : card,
      ),
    );
    setPendingQuantity(null);
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;

    const { cardId } = pendingRemoval;
    const removed = await removePokemonFromPortfolio(cardId, false);
    if (!removed) return;

    setPortfolio((current) => current.filter((card) => card.id !== cardId));
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
    if (!ok) return;

    setPortfolio((current) =>
      current.map((card) =>
        card.id === pendingPriceSource.cardId
          ? { ...card, priceSource: pendingPriceSource.priceSource }
          : card,
      ),
    );
    setPendingPriceSource(null);
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
    return (
      <main className="portfolio portfolio--status ui-render-fade" key="logged-out">
        <h1>Log in to view your collection</h1>
        <p>
          <button
            onClick={() => navigate("/signup")}
            className="portfolio__link"
          >
            Sign up
          </button>
          {" or "}
          <button
            onClick={() => setShowLoginModal(true)}
            className="portfolio__link"
          >
            log in
          </button>
          {" to access your collection."}
        </p>
        <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      </main>
    );
  }

  if (portfolioError) {
    return (
      <main className="portfolio portfolio--status ui-render-fade" key="error">
        <h1>Couldn&apos;t load your collection</h1>
        <p>{portfolioError}</p>
        <button
          type="button"
          className="portfolio__link"
          onClick={() => {
            void loadPortfolio();
          }}
        >
          Try again
        </button>
      </main>
    );
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
                <div className="portfolio__total-market-heading">
                  <span className="portfolio__total-market-label">TCG Player · USD</span>
                  <span className="badge-small portfolio__total-count">
                    {cardsUsd} {cardsUsd === 1 ? "card" : "cards"}
                  </span>
                </div>
                <strong className="portfolio__total-market-value">
                  {totalUsd > 0 ? `$${money.format(totalUsd)}` : "—"}
                </strong>
              </div>
              <div
                className="portfolio__total-market-divider"
                aria-hidden="true"
              />
              <div className="portfolio__total-market portfolio__total-market--eur">
                <div className="portfolio__total-market-heading">
                  <span className="portfolio__total-market-label">
                    Cardmarket · EUR
                  </span>
                  <span className="badge-small portfolio__total-count">
                    {cardsEur} {cardsEur === 1 ? "card" : "cards"}
                  </span>
                </div>
                <strong className="portfolio__total-market-value">
                  {totalEur > 0 ? `€${money.format(totalEur)}` : "—"}
                </strong>
              </div>
            </div>
          </div>
        )}
      </header>

      {missingCardIds.length > 0 && (
        <p role="status">
          {missingCardIds.length} saved{" "}
          {missingCardIds.length === 1 ? "card is" : "cards are"} temporarily
          unavailable. No portfolio entries were removed.
        </p>
      )}

      {portfolio.length === 0 ? (
        <div className="portfolio__empty">
          {missingCardIds.length > 0 ? (
            <>
              <h2>Saved cards temporarily unavailable</h2>
              <p>Your portfolio references are still safely stored.</p>
            </>
          ) : (
            <>
              <h2>No saved cards yet</h2>
              <p>Cards you add to your portfolio will appear here.</p>
            </>
          )}
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
                      label="Update?"
                      confirmLabel="OK"
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

export default function Portfolio() {
  const { user } = useAuth();

  // Remount all hydrated cards, pending edits, and in-flight request state when
  // the authenticated account changes. Data from one UID can never render in
  // another UID's portfolio, even for a single transition frame.
  return <PortfolioForCurrentUser key={user?.uid ?? "logged-out"} />;
}
