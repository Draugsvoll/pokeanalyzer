import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LogIn, Plus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCardNumber } from "../../../shared/formatCardNumber";
import Button from "../../components/button/Button";
import { GridView } from "../../components/gridView/GridView";
import LoginModal from "../../components/loginmodal/Loginmodal";
import { PokemonCardPortfolioView } from "../../components/pokemonCardView/PokemonCardView";
import { SelectDropdown } from "../../components/selectDropdown/SelectDropdown";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { getHydratedPortfolio } from "../../services/portfolioApi";
import type {
  PortfolioCard,
  PortfolioComparisonPeriod,
} from "../../types/portfolio";
import { logClientError } from "../../utils/logClientError";
import {
  getPortfolioStats,
  getVisiblePortfolioCards,
  portfolioPriceChange,
  portfolioQuantity,
  type PortfolioSort,
} from "./portfolioUtils";
import "./Portfolio.scss";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const SORT_OPTIONS: { value: PortfolioSort; label: string }[] = [
  { value: "unsorted", label: "Unsorted" },
  { value: "name-az", label: "Name: A–Z" },
  { value: "price-high", label: "Price: high–low" },
  { value: "price-low", label: "Price: low–high" },
  { value: "holding-high", label: "Holding value" },
  { value: "change-high", label: "% change: high–low" },
  { value: "change-low", label: "% change: low–high" },
];

const CHANGE_PERIOD_OPTIONS: Array<{
  value: PortfolioComparisonPeriod;
  label: string;
}> = [
  { value: "1d", label: "1D" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

const PERIOD_LABELS: Record<PortfolioComparisonPeriod, string> = {
  "1d": "1-day",
  "7d": "7-day",
  "30d": "30-day",
};

function formatMoney(value: number) {
  return `$${money.format(value)}`;
}

function formatSignedMoney(value: number) {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? "+" : "−"}$${money.format(Math.abs(value))}`;
}

function formatSignedPercent(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function formatAbsolutePercent(value: number) {
  if (value === 0) return "0%";
  return `${Math.abs(value).toFixed(1)}%`;
}

function PortfolioLoading({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <main className="portfolio portfolio--loading" aria-busy="true">
      {showHeader && (
        <header className="portfolio__page-header">
          <div>
            <span className="portfolio__eyebrow">Portfolio</span>
            <h1>My collection</h1>
          </div>
        </header>
      )}
      <div className="portfolio__loading-panel" role="status">
        <span className="app-btn__spinner" aria-hidden="true" />
        <span>{showHeader ? "Loading collection" : "Loading"}</span>
      </div>
    </main>
  );
}

function PortfolioGuest() {
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const revealRef = useScrollReveal<HTMLElement>();

  return (
    <main className="portfolio portfolio--guest">
      <section
        className="portfolio__guest-state default-container ui-scroll-reveal"
        aria-labelledby="portfolio-guest-title"
        ref={revealRef}
      >
        <h2 id="portfolio-guest-title">Log in to view your collection</h2>
        <p>Your saved cards and portfolio details are tied to your account.</p>
        <div className="portfolio__guest-actions">
          <Button onClick={() => setLoginOpen(true)}>
            <LogIn aria-hidden="true" /> Log in
          </Button>
          <Button fill="ghost" onClick={() => navigate("/signup")}>
            Create account
          </Button>
        </div>
      </section>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}

function PortfolioForCurrentUser({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { replacePortfolioReferences } = usePortfolioCache();
  const requestControllerRef = useRef<AbortController | null>(null);
  const [cards, setCards] = useState<PortfolioCard[]>([]);
  const [missingCardIds, setMissingCardIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<PortfolioSort>("unsorted");
  const [changePeriod, setChangePeriod] =
    useState<PortfolioComparisonPeriod>("7d");
  const summaryRevealRef = useScrollReveal<HTMLElement>();
  const noticeRevealRef = useScrollReveal<HTMLDivElement>();
  const emptyRevealRef = useScrollReveal<HTMLElement>();
  const controlsRevealRef = useScrollReveal<HTMLElement>();

  const load = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await getHydratedPortfolio(userId, controller.signal);
      if (controller.signal.aborted) return;
      setCards(response.cards);
      setMissingCardIds(response.missingCardIds);
      replacePortfolioReferences(response.entries);
    } catch (cause) {
      if (controller.signal.aborted) return;
      logClientError("Failed to load portfolio cards", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to load your collection.",
      );
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [replacePortfolioReferences, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      const controller = requestControllerRef.current;
      requestControllerRef.current = null;
      controller?.abort();
    };
  }, [load]);

  const visibleCards = useMemo(
    () => getVisiblePortfolioCards(cards, filter, sort, changePeriod),
    [cards, changePeriod, filter, sort],
  );
  const stats = useMemo(
    () => getPortfolioStats(cards, changePeriod),
    [cards, changePeriod],
  );
  const changeTone =
    stats.changePercent == null || stats.changePercent === 0
      ? "neutral"
      : stats.changePercent > 0
        ? "positive"
        : "negative";
  const topHoldingChange = stats.topHolding
    ? portfolioPriceChange(stats.topHolding.card, changePeriod)
    : null;
  const topHoldingChangeTone =
    topHoldingChange == null || topHoldingChange === 0
      ? "flat"
      : topHoldingChange > 0
        ? "up"
        : "down";
  const topHoldingCardNumber = stats.topHolding
    ? formatCardNumber(stats.topHolding.card)
    : undefined;

  if (loading) return <PortfolioLoading />;

  if (error) {
    return (
      <main className="portfolio portfolio--status">
        <section className="portfolio__status-card" role="alert">
          <span className="portfolio__status-icon" aria-hidden="true">
            <AlertTriangle />
          </span>
          <span className="portfolio__eyebrow">Collection unavailable</span>
          <h1>We couldn&apos;t load your portfolio.</h1>
          <p>{error}</p>
          <div className="portfolio__status-actions">
            <Button onClick={() => void load()}>Try again</Button>
            <Button fill="ghost" onClick={() => navigate("/search")}>
              Explore cards
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="portfolio">
      <header className="portfolio__page-header">
        <div>
          <span className="portfolio__eyebrow">Portfolio</span>
          <h1>My collection</h1>
        </div>
        <div className="portfolio__page-actions">
          <Button onClick={() => navigate("/search")}>
            <Plus aria-hidden="true" /> Add cards
          </Button>
        </div>
      </header>

      {cards.length > 0 && (
        <section
          className="portfolio__summary ui-scroll-reveal"
          aria-label="Collection summary"
          ref={summaryRevealRef}
        >
          <article
            key={`value:${stats.totalValue}:${stats.pricedCards}:${stats.totalCards}`}
            className="portfolio__metric portfolio__metric--value ui-render-fade"
          >
            <span>Collection value</span>
            <strong>
              {stats.totalValue > 0 ? formatMoney(stats.totalValue) : "—"}
            </strong>
            <small>
              {stats.pricedCards === stats.totalCards
                ? "TCGPlayer Near Mint prices"
                : `${stats.pricedCards} of ${stats.totalCards} cards have reference prices`}
            </small>
          </article>
          <article
            key={`change:${changePeriod}:${stats.changePercent}:${stats.changeAmount}:${stats.comparableCards}`}
            className={`portfolio__metric portfolio__metric--${changeTone} ui-render-fade`}
          >
            <span>{PERIOD_LABELS[changePeriod]} change</span>
            <strong className="portfolio__change-value">
              {stats.changeAmount == null || stats.changePercent == null ? (
                "—"
              ) : (
                <>
                  {formatSignedMoney(stats.changeAmount)}
                  <span>({formatSignedPercent(stats.changePercent)})</span>
                </>
              )}
            </strong>
            <small>
              {integer.format(stats.comparableCards)} of{" "}
              {integer.format(stats.totalCards)} cards have valid price data
            </small>
          </article>
          <article
            key={`cards:${stats.totalCards}`}
            className="portfolio__metric ui-render-fade"
          >
            <span>Cards</span>
            <strong>{integer.format(stats.totalCards)}</strong>
            <small>Total cards in collection</small>
          </article>
          <article
            key={`top:${stats.topHolding?.card.id ?? "none"}:${stats.topHolding?.value ?? "none"}:${stats.topHolding ? portfolioQuantity(stats.topHolding.card) : 0}:${changePeriod}:${topHoldingChange}`}
            className="portfolio__metric portfolio__metric--top-holding ui-render-fade"
          >
            <span>Top holding</span>
            <strong className="portfolio__holding-value">
              {stats.topHolding ? formatMoney(stats.topHolding.value) : "—"}
              {topHoldingChange != null && (
                <span
                  className={`pokemon-card__price-change pokemon-card__price-change--${topHoldingChangeTone}`}
                  title={`${PERIOD_LABELS[changePeriod]} price change`}
                  aria-label={`${PERIOD_LABELS[changePeriod]} price change ${formatSignedPercent(topHoldingChange)}`}
                >
                  {topHoldingChangeTone !== "flat" && (
                    <span
                      aria-hidden="true"
                      className="pokemon-card__price-change-arrow"
                    />
                  )}
                  {formatAbsolutePercent(topHoldingChange)}
                </span>
              )}
            </strong>
            <small className="portfolio__holding-meta">
              {stats.topHolding ? (
                <>
                  <span>{stats.topHolding.card.name}</span>
                  {topHoldingCardNumber && (
                    <>
                      <span
                        aria-hidden="true"
                        className="portfolio__holding-separator"
                      >
                        ·
                      </span>
                      <span
                        className="pokemon-card__number"
                        title={`Card number ${topHoldingCardNumber}`}
                      >
                        {topHoldingCardNumber}
                      </span>
                    </>
                  )}
                </>
              ) : (
                "No priced cards"
              )}
            </small>
            {stats.topHolding?.card.image && (
              <img
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
                src={stats.topHolding.card.image}
              />
            )}
          </article>
        </section>
      )}

      {missingCardIds.length > 0 && (
        <div
          className="portfolio__notice ui-scroll-reveal"
          ref={noticeRevealRef}
          role="status"
        >
          <AlertTriangle aria-hidden="true" />
          <span>
            {missingCardIds.length} saved{" "}
            {missingCardIds.length === 1 ? "card is" : "cards are"} currently
            unavailable in the catalogue.
          </span>
        </div>
      )}

      {cards.length === 0 ? (
        <section
          className="portfolio__empty ui-scroll-reveal"
          ref={emptyRevealRef}
        >
          <h2>
            {missingCardIds.length > 0
              ? "No cards available"
              : "Your collection is empty"}
          </h2>
          <p>
            {missingCardIds.length > 0
              ? "Your saved cards could not be loaded from the catalogue."
              : "Add cards to start tracking your collection."}
          </p>
          <Button onClick={() => navigate("/search")}>
            <Plus aria-hidden="true" /> Add cards
          </Button>
        </section>
      ) : (
        <>
          <section
            className="portfolio__controls ui-scroll-reveal"
            aria-label="Collection controls"
            ref={controlsRevealRef}
          >
            <div className="portfolio__filter" role="search">
              <Search className="portfolio__filter-icon" aria-hidden="true" />
              <input
                id="portfolio-filter"
                className="portfolio__filter-input"
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search your collection"
                aria-label="Search your collection"
              />
              {filter && (
                <button
                  className="portfolio__filter-clear"
                  type="button"
                  onClick={() => setFilter("")}
                  aria-label="Clear collection search"
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="portfolio__control-group">
              <div className="portfolio__timeframe">
                <span
                  className="portfolio__control-label"
                  id="portfolio-change-period-label"
                >
                  Price change
                </span>
                <div
                  aria-labelledby="portfolio-change-period-label"
                  className="portfolio__timeframe-options"
                  role="radiogroup"
                >
                  {CHANGE_PERIOD_OPTIONS.map((option) => (
                    <label
                      className="portfolio__timeframe-option"
                      key={option.value}
                    >
                      <input
                        className="app-radio"
                        type="radio"
                        name="portfolio-change-period"
                        value={option.value}
                        checked={changePeriod === option.value}
                        onChange={() => setChangePeriod(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="portfolio__sort-group">
                <span className="portfolio__control-label">Sort</span>
                <SelectDropdown
                  ariaLabel="Sort portfolio cards"
                  className="portfolio__sort"
                  options={SORT_OPTIONS}
                  value={sort}
                  onChange={setSort}
                />
              </div>
            </div>
          </section>

          {visibleCards.length === 0 ? (
            <section
              className="portfolio__empty portfolio__empty--filtered ui-scroll-reveal"
              ref={emptyRevealRef}
            >
              <h2>No cards match your search</h2>
              <p>Try another card name, set, number, rarity, or variant.</p>
            </section>
          ) : (
            <GridView>
              {visibleCards.map((card) => (
                <PokemonCardPortfolioView
                  key={card.id}
                  card={card}
                  quantity={portfolioQuantity(card)}
                  comparisonPriceSnapshot={
                    card.priceSnapshots?.[changePeriod] ?? null
                  }
                  onQuantityUpdated={(cardId, nextQuantity) =>
                    setCards((current) =>
                      current.map((item) =>
                        item.id === cardId
                          ? { ...item, quantity: nextQuantity }
                          : item,
                      ),
                    )
                  }
                  onRemoved={(cardId) =>
                    setCards((current) =>
                      current.filter((item) => item.id !== cardId),
                    )
                  }
                />
              ))}
            </GridView>
          )}
        </>
      )}
    </main>
  );
}

export default function Portfolio() {
  const { user, loading } = useAuth();

  if (loading) return <PortfolioLoading showHeader={false} />;
  if (!user) return <PortfolioGuest />;

  return <PortfolioForCurrentUser key={user.uid} userId={user.uid} />;
}
