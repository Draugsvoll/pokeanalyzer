import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LogIn, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCardNumber } from "../../../shared/formatCardNumber";
import {
  formatPriceChangePeriodLabel,
  formatPriceChangePeriodLong,
  PRICE_CHANGE_PERIODS,
} from "../../../shared/priceChangePeriod";
import Button from "../../components/button/Button";
import { CardIdentity } from "../../components/cardIdentity/CardIdentity";
import { EmbeddedCardSearchDialog } from "../../components/embeddedCardSearchDialog/EmbeddedCardSearchDialog";
import { FilterInput } from "../../components/filterInput/FilterInput";
import { GridView } from "../../components/gridView/GridView";
import LoginModal from "../../components/loginmodal/Loginmodal";
import {
  OverviewMetric,
  OverviewPanel,
} from "../../components/overviewPanel/OverviewPanel";
import { PokemonCardPortfolioView } from "../../components/pokemonCardView/PokemonCardView";
import { PriceChange } from "../../components/priceChange/PriceChange";
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
  portfolioQuantity,
  type PortfolioFeaturedMetric,
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
}> = PRICE_CHANGE_PERIODS.map((value) => ({
  label: formatPriceChangePeriodLabel(value).toUpperCase(),
  value,
}));

function formatMoney(value: number) {
  return `$${money.format(value)}`;
}

function formatSignedPercent(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

type FeaturedCardMetricProps = {
  item: PortfolioFeaturedMetric | null;
  label: string;
  period: PortfolioComparisonPeriod;
  unavailableLabel: string;
};

function FeaturedCardMetric({
  item,
  label,
  period,
  unavailableLabel,
}: FeaturedCardMetricProps) {
  const cardNumber = item ? formatCardNumber(item.card) : undefined;
  const periodLong = formatPriceChangePeriodLong(period);

  return (
    <OverviewMetric
      className="portfolio__metric ui-render-fade"
      detail={
        item ? (
          <CardIdentity name={item.card.name} number={cardNumber} />
        ) : (
          unavailableLabel
        )
      }
      imageSrc={item?.card.image}
      label={label}
      value={
        <>
          {item ? formatMoney(item.value) : "—"}
          {item?.change != null && (
            <PriceChange
              ariaLabel={`${periodLong} price change ${formatSignedPercent(item.change)}`}
              percent={item.change}
              period={period}
              title={`${periodLong} price change`}
            />
          )}
        </>
      }
      valueClassName="portfolio__holding-value"
    />
  );
}

function PortfolioLoading({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <div className="portfolio portfolio--loading" aria-busy="true">
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
    </div>
  );
}

function PortfolioGuest() {
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const revealRef = useScrollReveal<HTMLElement>();

  return (
    <div className="portfolio portfolio--guest">
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
    </div>
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
  const [cardSearchOpen, setCardSearchOpen] = useState(false);
  const [quantityDialogCardId, setQuantityDialogCardId] = useState<
    string | null
  >(null);
  const addCardsTriggerRef = useRef<HTMLButtonElement>(null);
  const cardSearchChangedPortfolioRef = useRef(false);
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
      setError("We couldn’t load your collection. Please try again.");
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [replacePortfolioReferences, userId]);

  const closeCardSearch = useCallback(() => {
    setCardSearchOpen(false);
    if (!cardSearchChangedPortfolioRef.current) return;

    cardSearchChangedPortfolioRef.current = false;
    void load();
  }, [load]);

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
  const changePeriodLong = formatPriceChangePeriodLong(changePeriod);

  if (loading) return <PortfolioLoading />;

  if (error) {
    return (
      <div className="portfolio portfolio--status">
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
      </div>
    );
  }

  return (
    <div className="portfolio">
      {cards.length > 0 && (
        <header className="portfolio__page-header">
          <div>
            <span className="portfolio__eyebrow">Portfolio</span>
            <h1>My collection</h1>
          </div>
          <div className="portfolio__page-actions">
            <Button
              aria-expanded={cardSearchOpen}
              onClick={() => setCardSearchOpen(true)}
              ref={addCardsTriggerRef}
            >
              <Plus aria-hidden="true" /> Add cards
            </Button>
          </div>
        </header>
      )}

      {cards.length > 0 && (
        <OverviewPanel
          ariaLabel="Collection summary"
          className="portfolio__summary ui-scroll-reveal"
          layout="two-featured"
          ref={summaryRevealRef}
        >
          <OverviewMetric
            key={`value:${stats.totalValue}:${stats.pricedCards}:${stats.totalCards}`}
            className="portfolio__metric portfolio__metric--value ui-render-fade"
            detail={
              stats.pricedCards === stats.totalCards
                ? "TCGPlayer Near Mint prices"
                : `${stats.pricedCards} of ${stats.totalCards} cards have reference prices`
            }
            label="Collection value"
            value={
              <>
                {stats.totalValue > 0 ? formatMoney(stats.totalValue) : "—"}
                {stats.changePercent != null && (
                  <PriceChange
                    ariaLabel={`${changePeriodLong} collection value change ${formatSignedPercent(stats.changePercent)}`}
                    percent={stats.changePercent}
                    period={changePeriod}
                    title={`${changePeriodLong} collection value change`}
                  />
                )}
              </>
            }
            valueClassName="portfolio__collection-value"
          />
          <OverviewMetric
            key={`cards:${stats.totalCards}`}
            className="portfolio__metric ui-render-fade"
            detail="Total cards in collection"
            label="Cards"
            value={integer.format(stats.totalCards)}
          />
          <FeaturedCardMetric
            key={`gainer:${stats.biggestGainer?.card.id ?? "none"}:${stats.biggestGainer?.value ?? "none"}:${changePeriod}:${stats.biggestGainer?.change ?? "none"}`}
            item={stats.biggestGainer}
            label="Biggest gainer"
            period={changePeriod}
            unavailableLabel="Price change unavailable"
          />
          <FeaturedCardMetric
            key={`top:${stats.topHolding?.card.id ?? "none"}:${stats.topHolding?.value ?? "none"}:${stats.topHolding ? portfolioQuantity(stats.topHolding.card) : 0}:${changePeriod}:${stats.topHolding?.change ?? "none"}`}
            item={stats.topHolding}
            label="Top holding"
            period={changePeriod}
            unavailableLabel="No priced cards"
          />
        </OverviewPanel>
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
          className="portfolio__empty default-container ui-scroll-reveal"
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
          <Button
            aria-expanded={cardSearchOpen}
            onClick={() => setCardSearchOpen(true)}
            ref={addCardsTriggerRef}
          >
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
            <FilterInput
              ariaLabel="Search your collection"
              className="portfolio__filter"
              clearLabel="Clear collection search"
              id="portfolio-filter"
              onChange={setFilter}
              placeholder="Search your collection"
              value={filter}
            />

            <div className="portfolio__control-group">
              <div className="portfolio__timeframe">
                <div
                  aria-label="Price change period"
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
                  comparisonPeriod={changePeriod}
                  quantity={portfolioQuantity(card)}
                  comparisonPriceSnapshot={
                    card.priceSnapshots?.[changePeriod] ?? null
                  }
                  quantityDialogOpen={quantityDialogCardId === card.id}
                  onQuantityDialogOpenChange={(open) =>
                    setQuantityDialogCardId((current) =>
                      open ? card.id : current === card.id ? null : current,
                    )
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
                  onRemoved={(cardId) => {
                    setCards((current) =>
                      current.filter((item) => item.id !== cardId),
                    );
                    setQuantityDialogCardId((current) =>
                      current === cardId ? null : current,
                    );
                  }}
                />
              ))}
            </GridView>
          )}
        </>
      )}

      <EmbeddedCardSearchDialog
        ariaLabel="Add cards"
        isOpen={cardSearchOpen}
        onClose={closeCardSearch}
        onPortfolioChanged={() => {
          cardSearchChangedPortfolioRef.current = true;
        }}
        returnFocusRef={addCardsTriggerRef}
      />
    </div>
  );
}

export default function Portfolio() {
  const { user, loading } = useAuth();

  if (loading) return <PortfolioLoading showHeader={false} />;
  if (!user) return <PortfolioGuest />;

  return <PortfolioForCurrentUser key={user.uid} userId={user.uid} />;
}
