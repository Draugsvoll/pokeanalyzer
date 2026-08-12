import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Search, TriangleAlert, X } from "lucide-react";
import { PokemonCardPortfolioView } from "../../components/pokemonCardView/PokemonCardView";
import Button from "../../components/button/Button";
import { GridView } from "../../components/gridView/GridView";
import { SelectDropdown } from "../../components/selectDropdown/SelectDropdown";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import {
  getPortfolioJustTcgPrices,
  getHydratedPortfolio,
  triggerMissingPortfolioJustTcgLookups,
  updatePortfolioPriceSource,
} from "../../services/portfolioApi";
import type {
  PortfolioCard,
  PortfolioComparisonPeriod,
  PortfolioPriceMode,
  PortfolioPriceSource,
} from "../../types/portfolio";
import { logClientError } from "../../utils/logClientError";
import {
  getDirectPriceChangeForOption,
  getHistoricalPriceForOption,
  resolvePortfolioCardPriceOption,
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
  { value: "change-high", label: "Change: high-low" },
  { value: "change-low", label: "Change: low-high" },
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
  priceMode: PortfolioPriceMode,
) {
  return resolvePortfolioCardPriceOption(card, priceMode)?.price ?? null;
}

function getPortfolioCardPriceChange(
  card: PortfolioCard,
  period: PortfolioChangePeriod,
  priceMode: PortfolioPriceMode,
) {
  const option = resolvePortfolioCardPriceOption(card, priceMode);
  const comparisonSnapshot = card.priceSnapshots?.[period];
  const directChange = getDirectPriceChangeForOption(card, option, period);
  if (directChange !== undefined) return directChange;
  if (option?.source !== "tcgplayer") return null;

  if (!option || !comparisonSnapshot) {
    return null;
  }

  const previousPrice = getHistoricalPriceForOption(option, comparisonSnapshot);
  if (previousPrice == null) return null;

  return ((option.price - previousPrice) / previousPrice) * 100;
}

function PortfolioForCurrentUser() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { replacePortfolioReferences } = usePortfolioCache();
  const activePortfolioRequestRef = useRef(0);
  const justTcgUpdateAbortRef = useRef<AbortController | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioCard[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [portfolioError, setPortfolioError] = useState("");
  const [missingCardIds, setMissingCardIds] = useState<string[]>([]);
  const [savedPriceSource, setSavedPriceSource] =
    useState<PortfolioPriceMode>("all");
  const [priceSource, setPriceSource] = useState<PortfolioPriceMode>("all");
  const [savingPriceSource, setSavingPriceSource] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const [portfolioSort, setPortfolioSort] = useState<PortfolioSort>("");
  const [changePeriod, setChangePeriod] =
    useState<PortfolioChangePeriod>("24h");
  const [loadingJustTcgPrices, setLoadingJustTcgPrices] = useState(false);

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
        const storedPriceSource = response.portfolioPriceSource;
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

  useEffect(
    () => () => {
      justTcgUpdateAbortRef.current?.abort();
    },
    [],
  );

  const portfolioCardIdKey = useMemo(
    () => portfolio.map((card) => card.id).join("|"),
    [portfolio],
  );

  const updateJustTcgPrices = useCallback(async () => {
    if (!user || loadingJustTcgPrices || !portfolioCardIdKey) return;

    justTcgUpdateAbortRef.current?.abort();
    const controller = new AbortController();
    justTcgUpdateAbortRef.current = controller;

    setLoadingJustTcgPrices(true);
    try {
      const response = await getPortfolioJustTcgPrices(
        user.uid,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      const justTcgByCardId = new Map(
        response.cards.map((card) => [card.cardId, card.justtcg]),
      );

      setPortfolio((current) =>
        current.map((card) => {
          if (!justTcgByCardId.has(card.id)) return card;
          const justtcg = justTcgByCardId.get(card.id);
          return justtcg ? { ...card, justtcg } : card;
        }),
      );
      if (response.missingCardIds.length > 0) {
        void triggerMissingPortfolioJustTcgLookups(
          response.missingCardIds,
          user.uid,
        ).catch((error) => {
          logClientError(
            "Failed to trigger missing portfolio JustTCG lookups",
            error,
          );
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      logClientError("Failed to load portfolio JustTCG prices", error);
    } finally {
      if (!controller.signal.aborted) {
        setLoadingJustTcgPrices(false);
      }
      if (justTcgUpdateAbortRef.current === controller) {
        justTcgUpdateAbortRef.current = null;
      }
    }
  }, [loadingJustTcgPrices, portfolioCardIdKey, user]);

  // Sum each card's resolved price x quantity.
  const { totalValue, valuedCardCount } = useMemo(() => {
    let totalValue = 0;
    let valuedCardCount = 0;

    for (const card of portfolio) {
      const quantity = cardQuantity(card);
      const option = resolvePortfolioCardPriceOption(card, priceSource);
      if (!option) continue;

      totalValue += option.price * quantity;
      valuedCardCount += quantity;
    }

    return { totalValue, valuedCardCount };
  }, [portfolio, priceSource]);

  const unstablePriceCardCount = useMemo(
    () =>
      portfolio.reduce((count, card) => {
        const source = resolvePortfolioCardPriceOption(
          card,
          priceSource,
        )?.source;
        if (!source || source === "justtcg") return count;
        return count + (card.priceReliability?.[source]?.isFlagged ? 1 : 0);
      }, 0),
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
        missingPrice:
          (priceSource === "all" || priceSource === "justtcg") &&
          getPortfolioCardPrice(card, priceSource) == null,
        value: isPriceSort
          ? getPortfolioCardPrice(card, priceSource)
          : getPortfolioCardPriceChange(card, changePeriod, priceSource),
      }))
      .sort((a, b) => {
        if (!isPriceSort) {
          if (a.value == null && b.value == null) return a.index - b.index;
          if (a.value == null) return 1;
          if (b.value == null) return -1;

          const difference = descending ? b.value - a.value : a.value - b.value;
          return difference || a.index - b.index;
        }

        if (a.missingPrice !== b.missingPrice) {
          return a.missingPrice ? -1 : 1;
        }
        if (a.value == null && b.value == null) return a.index - b.index;
        if (a.value == null) return 1;
        if (b.value == null) return -1;

        const difference = descending ? b.value - a.value : a.value - b.value;
        return difference || a.index - b.index;
      })
      .map(({ card }) => card);
  }, [changePeriod, filteredPortfolio, portfolioSort, priceSource]);

  const priceSourceChanged = priceSource !== savedPriceSource;
  const totalCurrencySymbol = priceSource === "cardmarket" ? "€" : "$";
  const missingPriceWarnings = (
    priceSource === "all"
      ? (["tcgplayer", "cardmarket", "justtcg"] as const)
      : ([priceSource] as const)
  )
    .map((source) => ({
      source,
      label:
        source === "tcgplayer"
          ? "TCG"
          : source === "cardmarket"
            ? "Cardmarket"
            : "JustTCG",
      count: portfolio.reduce(
        (count, card) =>
          count + (resolvePortfolioCardPriceOption(card, source) ? 0 : 1),
        0,
      ),
    }))
    .filter((warning) => warning.count > 0);

  const handleCardQuantityUpdated = (cardId: string, quantity: number) => {
    setPortfolio((current) =>
      current.map((card) =>
        card.id === cardId ? { ...card, quantity } : card,
      ),
    );
  };

  const handleCardRemoved = (cardId: string) => {
    setPortfolio((current) => current.filter((card) => card.id !== cardId));
  };

  const handleCardPriceSourceUpdated = (
    cardId: string,
    source: PortfolioPriceSource,
    priceKey: string,
    selectForAll: boolean,
  ) => {
    setPortfolio((current) =>
      current.map((card) =>
        card.id === cardId
          ? {
              ...card,
              priceSources: {
                ...(card.priceSources ?? {}),
                [source]: priceKey,
              },
              ...(selectForAll && { allPriceSource: source }),
            }
          : card,
      ),
    );
  };

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
                    ? `${totalCurrencySymbol}${money.format(totalValue)}`
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
                        value="all"
                        checked={priceSource === "all"}
                        disabled={savingPriceSource}
                        onChange={() => setPriceSource("all")}
                      />
                      <span>All</span>
                    </label>
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
                    <label>
                      <input
                        className="app-radio"
                        type="radio"
                        name="portfolio-value-source"
                        value="justtcg"
                        checked={priceSource === "justtcg"}
                        disabled={savingPriceSource}
                        onChange={() => setPriceSource("justtcg")}
                      />
                      <span>JustTCG</span>
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
                  {(priceSource === "all" || priceSource === "justtcg") && (
                    <Button
                      size="xsmall"
                      disabled={loadingJustTcgPrices || portfolio.length === 0}
                      aria-busy={loadingJustTcgPrices || undefined}
                      aria-label={
                        loadingJustTcgPrices
                          ? "Updating JustTCG portfolio prices"
                          : undefined
                      }
                      onClick={() => {
                        void updateJustTcgPrices();
                      }}
                    >
                      {loadingJustTcgPrices ? (
                        <span className="app-btn__spinner" aria-hidden="true" />
                      ) : (
                        "Update JustTCG"
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
        {missingPriceWarnings.map((warning) => (
          <div
            key={warning.source}
            className="portfolio__price-warning"
            role="status"
            aria-live="polite"
          >
            <TriangleAlert aria-hidden="true" />
            <span>
              {warning.label} has {warning.count}{" "}
              {warning.count === 1 ? "card" : "cards"} missing price data.
            </span>
          </div>
        ))}
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
          {visiblePortfolio.map((card) => {
            const option = resolvePortfolioCardPriceOption(card, priceSource);
            const activeSource =
              option?.source ??
              (priceSource === "all" ? "justtcg" : priceSource);

            return (
              <PokemonCardPortfolioView
                key={card.id}
                card={card}
                quantity={cardQuantity(card)}
                priceMode={priceSource}
                comparisonPriceSnapshot={
                  activeSource === "tcgplayer"
                    ? (card.priceSnapshots?.[changePeriod] ?? null)
                    : undefined
                }
                priceChangePercent={
                  activeSource === "justtcg"
                    ? getPortfolioCardPriceChange(
                        card,
                        changePeriod,
                        priceSource,
                      )
                    : undefined
                }
                priceChangeLabel={
                  activeSource === "justtcg"
                    ? `${changePeriod} change`
                    : undefined
                }
                priceSource={activeSource}
                showRarityBadge
                showPriceWarning={
                  activeSource !== "justtcg" &&
                  (card.priceReliability?.[activeSource]?.isFlagged ?? false)
                }
                onQuantityUpdated={handleCardQuantityUpdated}
                onRemoved={handleCardRemoved}
                onPriceSourceUpdated={handleCardPriceSourceUpdated}
              />
            );
          })}
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
