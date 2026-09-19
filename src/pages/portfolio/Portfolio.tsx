import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { PokemonCardPortfolioView } from "../../components/pokemonCardView/PokemonCardView";
import Button from "../../components/button/Button";
import { GridView } from "../../components/gridView/GridView";
import { SelectDropdown } from "../../components/selectDropdown/SelectDropdown";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { getHydratedPortfolio } from "../../services/portfolioApi";
import type {
  PortfolioCard,
  PortfolioComparisonPeriod,
} from "../../types/portfolio";
import { logClientError } from "../../utils/logClientError";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";
import "./Portfolio.scss";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Sort = "" | "price-high" | "price-low";
const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "", label: "-" },
  { value: "price-high", label: "Price: high-low" },
  { value: "price-low", label: "Price: low-high" },
];

const CHANGE_PERIOD_OPTIONS: Array<{
  value: PortfolioComparisonPeriod;
  label: string;
}> = [
  { value: "1d", label: "1D" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

function quantity(card: PortfolioCard) {
  return Number.isSafeInteger(card.quantity) && card.quantity > 0
    ? card.quantity
    : 1;
}

function price(card: PortfolioCard) {
  return resolvePokeTraceCardPrice(card)?.price ?? null;
}

function PortfolioForCurrentUser() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { replacePortfolioReferences } = usePortfolioCache();
  const [cards, setCards] = useState<PortfolioCard[]>([]);
  const [missingCardIds, setMissingCardIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("");
  const [changePeriod, setChangePeriod] =
    useState<PortfolioComparisonPeriod>("1d");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await getHydratedPortfolio(user.uid, signal);
        if (signal?.aborted) return;
        setCards(response.cards);
        setMissingCardIds(response.missingCardIds);
        replacePortfolioReferences(response.entries);
      } catch (cause) {
        if (signal?.aborted) return;
        logClientError("Failed to load portfolio cards", cause);
        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to load your collection.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [replacePortfolioReferences, user],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const visibleCards = useMemo(() => {
    const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = terms.length
      ? cards.filter((card) => {
          const value = [card.name, card.set?.name, card.rarity]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return terms.every((term) => value.includes(term));
        })
      : cards;
    if (!sort) return filtered;
    return [...filtered].sort((left, right) => {
      const leftPrice = price(left);
      const rightPrice = price(right);
      if (leftPrice == null) return 1;
      if (rightPrice == null) return -1;
      return sort === "price-high"
        ? rightPrice - leftPrice
        : leftPrice - rightPrice;
    });
  }, [cards, filter, sort]);

  const { totalValue, totalCards } = useMemo(
    () =>
      cards.reduce(
        (total, card) => ({
          totalCards: total.totalCards + quantity(card),
          totalValue: total.totalValue + (price(card) ?? 0) * quantity(card),
        }),
        { totalCards: 0, totalValue: 0 },
      ),
    [cards],
  );

  if (authLoading || loading) {
    return (
      <main className="portfolio portfolio--status">
        <h1>Loading collection...</h1>
      </main>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  if (error) {
    return (
      <main className="portfolio portfolio--status">
        <h1>Couldn&apos;t load your collection</h1>
        <p>{error}</p>
        <button
          className="portfolio__link"
          onClick={() => void load()}
          type="button"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="portfolio ui-render-fade">
      <div className="portfolio__toolbar">
        <div className="portfolio__primary">
          <header className="portfolio__header">
            <div>
              <span className="portfolio__eyebrow">Portfolio</span>
              <h1>My collection</h1>
            </div>
          </header>
          {cards.length > 0 && (
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
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filter"
                  />
                  {filter && (
                    <button
                      className="portfolio__filter-clear"
                      type="button"
                      onClick={() => setFilter("")}
                      aria-label="Clear filter"
                    >
                      <X aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <fieldset className="portfolio__timeframe">
                <legend className="portfolio__control-label">Change</legend>
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
              </fieldset>
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
              <div className="portfolio__total" aria-live="polite">
                <span className="portfolio__total-label">Collection value</span>
                <strong className="portfolio__total-market-value">
                  {totalValue > 0 ? `$${money.format(totalValue)}` : "—"}
                </strong>
                <span className="portfolio__total-count">
                  {totalCards} {totalCards === 1 ? "card" : "cards"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {missingCardIds.length > 0 && (
        <p role="status">
          {missingCardIds.length} saved{" "}
          {missingCardIds.length === 1 ? "card is" : "cards are"} unavailable in
          the local catalogue.
        </p>
      )}
      {cards.length === 0 ? (
        <div className="portfolio__empty">
          {missingCardIds.length > 0 ? (
            <>
              <h2>Saved cards unavailable</h2>
              <p>The saved card IDs are not available in the catalogue.</p>
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
          {visibleCards.map((card) => (
            <PokemonCardPortfolioView
              key={card.id}
              card={card}
              quantity={quantity(card)}
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
    </main>
  );
}

export default function Portfolio() {
  const { user } = useAuth();
  return <PortfolioForCurrentUser key={user?.uid ?? "signed-out"} />;
}
