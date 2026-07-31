import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Search, TriangleAlert, X } from "lucide-react";
import Button from "../../components/button/Button";
import { ConfirmPopover } from "../../components/confirmPopover/ConfirmPopover";
import { GridView } from "../../components/gridView/GridView";
import { PokemonCard } from "../../components/pokemonCard/PokemonCard";
import { SelectDropdown } from "../../components/selectDropdown/SelectDropdown";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { usePokemonPortfolio } from "../../hooks/pokemonPortfolio";
import {
  getHydratedPortfolio,
  updatePortfolioPriceSource,
} from "../../services/portfolioApi";
import type {
  PortfolioCard,
  PortfolioComparisonPeriod,
  PortfolioPriceSource,
} from "../../types/portfolio";
import { logClientError } from "../../utils/logClientError";
import {
  getDefaultCardPriceOptionForSource,
  getHistoricalPriceForOption,
} from "../../utils/pokemonPricing";
import "./Portfolio.scss";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function cardQuantity(card: PortfolioCard) {
  const quantity = Number(card.quantity ?? 1);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

function normalizeFilterValue(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase();
}

type PortfolioSort =
  "" | "price-high" | "price-low" | "change-high" | "change-low";
type PortfolioChangePeriod = Exclude<PortfolioComparisonPeriod, "latest">;

const PORTFOLIO_SORT_OPTIONS: {
  value: PortfolioSort;
  label: string;
}[] = [
  { value: "", label: "—" },
  { value: "price-high", label: "Price: high-low" },
  { value: "price-low", label: "Price: low-high" },
  { value: "change-high", label: "%Change: high-low" },
  { value: "change-low", label: "%Change: low-high" },
];

const CHANGE_PERIOD_OPTIONS: {
  value: PortfolioChangePeriod;
  label: string;
}[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 day" },
  { value: "30d", label: "30 day" },
];

function getPortfolioCardPrice(
  card: PortfolioCard,
  priceSource: PortfolioPriceSource,
) {
  return getDefaultCardPriceOptionForSource(card, priceSource)?.price ?? null;
}

function getPortfolioCardPriceChange(
  card: PortfolioCard,
  period: PortfolioChangePeriod,
  priceSource: PortfolioPriceSource,
) {
  const option = getDefaultCardPriceOptionForSource(card, priceSource);
  const latestSnapshot = card.priceSnapshots?.latest;
  const comparisonSnapshot = card.priceSnapshots?.[period];
  if (!option || !latestSnapshot || !comparisonSnapshot) {
    return null;
  }

  const latestPrice = getHistoricalPriceForOption(option, latestSnapshot);
  const previousPrice = getHistoricalPriceForOption(option, comparisonSnapshot);
  if (latestPrice == null || previousPrice == null) return null;

  return ((option.price - previousPrice) / previousPrice) * 100;
}

function PortfolioForCurrentUser() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { replacePortfolioReferences } = usePortfolioCache();
  const { removePokemonFromPortfolio, updatePokemonQuantity } =
    usePokemonPortfolio();
  const activePortfolioRequestRef = useRef(0);
  const [portfolio, setPortfolio] = useState<PortfolioCard[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [portfolioError, setPortfolioError] = useState("");
  const [missingCardIds, setMissingCardIds] = useState<string[]>([]);
  const [updatingQuantityId, setUpdatingQuantityId] = useState<string | null>(
    null,
  );
  const [pendingQuantity, setPendingQuantity] = useState<{
    cardId: string;
    quantity: number;
  } | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    cardId: string;
    cardName: string;
  } | null>(null);
  const [updatingRemovalId, setUpdatingRemovalId] = useState<string | null>(
    null,
  );
  const [savedPriceSource, setSavedPriceSource] =
    useState<PortfolioPriceSource>("tcgplayer");
  const [priceSource, setPriceSource] =
    useState<PortfolioPriceSource>("tcgplayer");
  const [savingPriceSource, setSavingPriceSource] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const [portfolioSort, setPortfolioSort] = useState<PortfolioSort>("");
  const [changePeriod, setChangePeriod] =
    useState<PortfolioChangePeriod>("24h");

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
        if (signal?.aborted || requestId !== activePortfolioRequestRef.current)
          return;
        const storedPriceSource =
          response.portfolioPriceSource === "cardmarket"
            ? "cardmarket"
            : "tcgplayer";
        setPortfolio(response.cards);
        setMissingCardIds(response.missingCardIds);
        setSavedPriceSource(storedPriceSource);
        setPriceSource(storedPriceSource);
        replacePortfolioReferences(response.entries);
      } catch (error) {
        if (signal?.aborted || requestId !== activePortfolioRequestRef.current)
          return;
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
  const { totalValue, valuedCardCount } = useMemo(() => {
    let totalValue = 0;
    let valuedCardCount = 0;

    for (const card of portfolio) {
      const quantity = cardQuantity(card);
      const option = getDefaultCardPriceOptionForSource(card, priceSource);
      if (!option) continue;

      totalValue += option.price * quantity;
      valuedCardCount += quantity;
    }

    return { totalValue, valuedCardCount };
  }, [portfolio, priceSource]);

  const unstablePriceCardCount = useMemo(
    () =>
      portfolio.reduce(
        (count, card) =>
          count + (card.priceReliability?.[priceSource]?.isFlagged ? 1 : 0),
        0,
      ),
    [portfolio, priceSource],
  );

  const filteredPortfolio = useMemo(() => {
    const terms = normalizeFilterValue(nameFilter).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return portfolio;

    return portfolio.filter((card) => {
      const searchableCardData = [
        card.name,
        card.set?.name,
        card.set?.series,
        card.rarity,
      ]
        .map(normalizeFilterValue)
        .join(" ");

      return terms.every((term) => searchableCardData.includes(term));
    });
  }, [nameFilter, portfolio]);

  const visiblePortfolio = useMemo(() => {
    if (!portfolioSort) return filteredPortfolio;

    const isPriceSort = portfolioSort.startsWith("price");
    const descending = portfolioSort.endsWith("high");

    return filteredPortfolio
      .map((card, index) => ({
        card,
        index,
        value: isPriceSort
          ? getPortfolioCardPrice(card, priceSource)
          : getPortfolioCardPriceChange(card, changePeriod, priceSource),
      }))
      .sort((a, b) => {
        if (a.value == null && b.value == null) return a.index - b.index;
        if (a.value == null) return isPriceSort ? 1 : -1;
        if (b.value == null) return isPriceSort ? -1 : 1;

        const difference = descending ? b.value - a.value : a.value - b.value;
        return difference || a.index - b.index;
      })
      .map(({ card }) => card);
  }, [changePeriod, filteredPortfolio, portfolioSort, priceSource]);

  const requestQuantityChange = (card: PortfolioCard, amount: number) => {
    if (updatingQuantityId) return;

    const currentQuantity =
      pendingQuantity?.cardId === card.id
        ? pendingQuantity.quantity
        : (card.quantity ?? 1);
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
    setUpdatingRemovalId(cardId);

    try {
      const removed = await removePokemonFromPortfolio(cardId, false);
      if (!removed) return;

      setPortfolio((current) => current.filter((card) => card.id !== cardId));
      setPendingRemoval(null);
    } finally {
      setUpdatingRemovalId(null);
    }
  };

  const priceSourceChanged = priceSource !== savedPriceSource;

  const savePriceSource = async () => {
    if (!user || !priceSourceChanged || savingPriceSource) return;

    setSavingPriceSource(true);
    try {
      const response = await updatePortfolioPriceSource(priceSource, user.uid);
      setSavedPriceSource(response.portfolioPriceSource);
      setPriceSource(response.portfolioPriceSource);
    } catch (error) {
      logClientError("Failed to save portfolio price source", error);
      alert("Failed to save collection price source.");
    } finally {
      setSavingPriceSource(false);
    }
  };

  useEffect(() => {
    if (!pendingQuantity && !pendingRemoval) return;

    const cancelWhenClickingOutside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".ui-confirm-popover, .portfolio__quantity-control, .portfolio__quantity-display",
        )
      )
        return;
      setPendingQuantity(null);
      setPendingRemoval(null);
    };

    document.addEventListener("pointerdown", cancelWhenClickingOutside);
    return () =>
      document.removeEventListener("pointerdown", cancelWhenClickingOutside);
  }, [pendingQuantity, pendingRemoval]);

  if (authLoading || loadingPortfolio) {
    return (
      <main
        className="portfolio portfolio--status ui-render-fade"
        key="loading"
      >
        <h1>Loading collection...</h1>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
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
      <div className="portfolio__toolbar">
        <div className="portfolio__primary">
          <header className="portfolio__header">
            <div>
              <span className="portfolio__eyebrow">Portfolio</span>
              <h1>My collection</h1>
            </div>
          </header>
          {portfolio.length > 0 && (
            <div className="portfolio__filter-bar">
              <div className="portfolio__filter-group">
                <label
                  className="portfolio__control-label"
                  htmlFor="portfolio-filter"
                >
                  Filter
                </label>
                <div className="portfolio__filter" role="search">
                  <Search
                    className="portfolio__filter-icon"
                    aria-hidden="true"
                  />
                  <input
                    id="portfolio-filter"
                    className="portfolio__filter-input"
                    type="search"
                    value={nameFilter}
                    onChange={(event) => setNameFilter(event.target.value)}
                    placeholder="Name, set, series, rarity"
                    aria-label="Filter portfolio cards by name, set, series, or rarity"
                    autoComplete="off"
                  />
                  {nameFilter.length > 0 && (
                    <button
                      type="button"
                      className="portfolio__filter-clear"
                      onClick={() => setNameFilter("")}
                      aria-label="Clear name filter"
                    >
                      <X aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <div
                className="portfolio__timeframe"
                role="radiogroup"
                aria-labelledby="portfolio-change-period-label"
              >
                <span
                  id="portfolio-change-period-label"
                  className="portfolio__control-label"
                >
                  % Change
                </span>
                <div className="portfolio__timeframe-options">
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
                  options={PORTFOLIO_SORT_OPTIONS}
                  value={portfolioSort}
                  onChange={setPortfolioSort}
                />
              </div>
              <div className="portfolio__total" aria-live="polite">
                <div className="portfolio__total-heading">
                  <span className="portfolio__total-label">
                    Collection value
                  </span>
                </div>
                <strong className="portfolio__total-market-value">
                  {totalValue > 0
                    ? `${priceSource === "tcgplayer" ? "$" : "€"}${money.format(totalValue)}`
                    : "—"}
                </strong>
                <div
                  className="portfolio__value-source-options"
                  role="radiogroup"
                  aria-label="Collection value price source"
                  aria-busy={savingPriceSource || undefined}
                >
                  <div className="portfolio__value-source-radios">
                    <label>
                      <input
                        className="app-radio"
                        type="radio"
                        name="portfolio-value-source"
                        value="tcgplayer"
                        checked={priceSource === "tcgplayer"}
                        disabled={savingPriceSource}
                        onChange={() => setPriceSource("tcgplayer")}
                      />
                      <span>TCGPlayer</span>
                    </label>
                    <label>
                      <input
                        className="app-radio"
                        type="radio"
                        name="portfolio-value-source"
                        value="cardmarket"
                        checked={priceSource === "cardmarket"}
                        disabled={savingPriceSource}
                        onChange={() => setPriceSource("cardmarket")}
                      />
                      <span>Cardmarket</span>
                    </label>
                  </div>
                  {priceSourceChanged && (
                    <Button
                      size="xsmall"
                      disabled={savingPriceSource}
                      aria-busy={savingPriceSource || undefined}
                      aria-label={
                        savingPriceSource
                          ? "Saving collection price source"
                          : undefined
                      }
                      onClick={() => {
                        void savePriceSource();
                      }}
                    >
                      {savingPriceSource ? (
                        <span className="app-btn__spinner" aria-hidden="true" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  )}
                </div>
                <span className="portfolio__total-count">
                  {valuedCardCount}{" "}
                  {valuedCardCount === 1 ? "card valued" : "Cards"}
                </span>
              </div>
            </div>
          )}
        </div>
        {unstablePriceCardCount > 0 && (
          <div
            className="portfolio__price-warning"
            role="status"
            aria-live="polite"
          >
            <TriangleAlert aria-hidden="true" />
            <span>
              {unstablePriceCardCount}{" "}
              {unstablePriceCardCount === 1 ? "card has a" : "cards have"}{" "}
              potentially unstable{" "}
              {unstablePriceCardCount === 1 ? "price" : "prices"}. Please check
              the price feature to verify. This happens on TCG and Cardmarket
              prices with low listing counts or high volatility.
            </span>
          </div>
        )}
      </div>

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
              <Button onClick={() => navigate("/search")}>
                <Search aria-hidden="true" />
                Find cards
              </Button>
            </>
          )}
        </div>
      ) : (
        <GridView>
          {visiblePortfolio.map((card) => (
            <div
              key={card.id}
              className={`portfolio__card${
                pendingQuantity?.cardId === card.id ||
                pendingRemoval?.cardId === card.id
                  ? " portfolio__card--confirming"
                  : ""
              }`}
            >
              <div className="portfolio__card-main">
                <PokemonCard
                  card={card}
                  quantity={card.quantity}
                  latestPriceSnapshot={card.priceSnapshots?.latest ?? null}
                  comparisonPriceSnapshot={
                    card.priceSnapshots?.[changePeriod] ?? null
                  }
                  priceSource={priceSource}
                  lockPriceSource
                  showRarityBadge
                  showPriceWarning={
                    card.priceReliability?.[priceSource]?.isFlagged ?? false
                  }
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
                    value={
                      pendingQuantity?.cardId === card.id
                        ? pendingQuantity.quantity
                        : (card.quantity ?? 1)
                    }
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
                        : (card.quantity ?? 1)) <= 1 ||
                      updatingQuantityId === card.id
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
                    onClick={() =>
                      setPendingRemoval({
                        cardId: card.id,
                        cardName: card.name,
                      })
                    }
                  >
                    <X aria-hidden="true" />
                  </button>
                  {pendingRemoval?.cardId === card.id && (
                    <ConfirmPopover
                      className="portfolio__quantity-confirm"
                      label="Delete?"
                      confirmLabel="OK"
                      aria-label="Confirm card removal"
                      confirming={updatingRemovalId === card.id}
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
