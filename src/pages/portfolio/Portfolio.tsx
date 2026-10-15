import { OverviewScopeControl } from "../../components/overviewPanel/OverviewScopeControl";
import { useWatchlistCache } from "../../context/watchlistCacheContextValue";
import { getHydratedWatchlist } from "../../services/watchlistApi";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, LogIn, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatPokeTraceMoney } from "../../../shared/pokeTraceCurrency";
import { formatPriceChangePeriodLong } from "../../../shared/priceChangePeriod";
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
import {
  PokemonCardView,
  PokemonCardPortfolioView,
} from "../../components/pokemonCardView/PokemonCardView";
import { PriceChange } from "../../components/priceChange/PriceChange";
import { PriceChangePeriodSelector } from "../../components/priceChangePeriodSelector/PriceChangePeriodSelector";
import type { ProductType } from "../../components/productTypeSwitch/ProductTypeSwitch";
import {
  SealedProductView,
  SealedProductPortfolioView,
} from "../../components/sealedProductView/SealedProductView";
import { SelectDropdown } from "../../components/selectDropdown/SelectDropdown";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { getHydratedPortfolio } from "../../services/portfolioApi";
import type { PortfolioComparisonPeriod } from "../../types/portfolio";
import { logClientError } from "../../utils/logClientError";
import {
  getPortfolioStats,
  getVisiblePortfolioItems,
  portfolioItemNumber,
  portfolioQuantity,
  portfolioPrice,
  portfolioComparisonSnapshot,
  type PortfolioFeaturedMetric,
  type PortfolioSort,
} from "./portfolioUtils";
import "./Portfolio.scss";

const integer = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const SORT_OPTIONS: { value: PortfolioSort; label: string }[] = [
  { value: "unsorted", label: "Unsorted" },
  { value: "name-az", label: "Name: A–Z" },
  { value: "price-high", label: "Price: high–low" },
  { value: "price-low", label: "Price: low–high" },
  { value: "holding-high", label: "Holding value" },
  { value: "change-high", label: "% Change: high–low" },
  { value: "change-low", label: "% Change: low–high" },
];

function formatSignedPercent(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

type FeaturedAssetMetricProps = {
  breakBefore?: boolean;
  item: PortfolioFeaturedMetric | null;
  label: string;
  onFilter: (value: string) => void;
  period: PortfolioComparisonPeriod;
  unavailableLabel: string;
};

function FeaturedAssetMetric({
  breakBefore = false,
  item,
  label,
  onFilter,
  period,
  unavailableLabel,
}: FeaturedAssetMetricProps) {
  const itemNumber = item ? portfolioItemNumber(item.item) : undefined;
  const filterValue = [item?.item.name, itemNumber].filter(Boolean).join(" ");
  const periodLong = formatPriceChangePeriodLong(period);

  return (
    <OverviewMetric
      action={
        item
          ? {
              label: `${label}: filter by ${filterValue}`,
              onClick: () => onFilter(filterValue),
            }
          : undefined
      }
      breakBefore={breakBefore}
      className="portfolio__metric"
      detail={
        item ? (
          <CardIdentity name={item.item.name} number={itemNumber} />
        ) : (
          unavailableLabel
        )
      }
      imageSrc={item?.item.image}
      label={label}
      value={
        <>
          {item ? formatPokeTraceMoney(item.value) : "—"}
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

function PortfolioPageHeader({
  actions,
  mode = "collection",
}: {
  actions?: ReactNode;
  mode?: ListMode;
}) {
  return (
    <header className="portfolio__page-header">
      <div>
        <span className="portfolio__eyebrow">Portfolio</span>
        <h1>My {mode}</h1>
      </div>
      {actions && <div className="portfolio__page-actions">{actions}</div>}
    </header>
  );
}

function PortfolioLoading({
  showHeader = true,
  mode = "collection",
}: {
  showHeader?: boolean;
  mode?: ListMode;
}) {
  return (
    <div className="portfolio portfolio--loading" aria-busy="true">
      {showHeader && <PortfolioPageHeader mode={mode} />}
      <div className="portfolio__loading-panel" role="status">
        <span className="app-btn__spinner" aria-hidden="true" />
        <span>{showHeader ? `Loading ${mode}` : "Loading"}</span>
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
        <p>Your saved assets and portfolio details are tied to your account.</p>
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

type ListMode = "collection" | "watchlist";
async function fetchWatchlistItems(userId: string, signal: AbortSignal) {
  const response = await getHydratedWatchlist(userId, signal);
  return {
    entries: response.entries,
    items: response.items.map((item) => ({ ...item, quantity: 1 })),
  };
}
const LIST_OPTIONS = [
  { label: "Collection", value: "collection" },
  { label: "Watchlist", value: "watchlist" },
] as const;

function PortfolioList() {
  const [mode, setMode] = useState<ListMode>("collection");
  const navigate = useNavigate();
  const collection = usePortfolioCache();
  const watchlist = useWatchlistCache();
  const hydrateCollection = collection.hydrate;
  const hydrateWatchlist = watchlist.hydrate;
  const { items, missingItems } = mode === "watchlist" ? watchlist : collection;
  const isWatchlist = mode === "watchlist";
  const listLabel = isWatchlist ? "Watchlist" : "Collection";
  const requestControllerRef = useRef<AbortController | null>(null);
  const initialLoadCompleteRef = useRef(false);
  const [loadedLists, setLoadedLists] = useState<
    Partial<Record<ListMode, boolean>>
  >({});
  const hasCachedList = Boolean(loadedLists[mode]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);

  const [sort, setSort] = useState<PortfolioSort>("unsorted");
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [searchProductType, setSearchProductType] =
    useState<ProductType>("singles");
  const [quantityDialogItemKey, setQuantityDialogItemKey] = useState<
    string | null
  >(null);
  const productSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const [changePeriod, setChangePeriod] =
    useState<PortfolioComparisonPeriod>("7d");
  const summaryRevealRef = useScrollReveal<HTMLElement>();
  const restoreSelectorFocusRef = useRef(false);
  const summaryRef = useCallback(
    (element: HTMLElement | null) => {
      summaryRevealRef(element);
      if (element && restoreSelectorFocusRef.current) {
        element
          .querySelector<HTMLInputElement>(
            `input[type="radio"][value="${mode}"]`,
          )
          ?.focus({ preventScroll: true });
        restoreSelectorFocusRef.current = false;
      }
    },
    [summaryRevealRef, mode],
  );
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
      const modes: ListMode[] = initialLoadCompleteRef.current
        ? [mode]
        : ["collection", "watchlist"];
      const results = await Promise.allSettled(
        modes.map((target) =>
          target === "watchlist"
            ? hydrateWatchlist(fetchWatchlistItems, controller.signal)
            : hydrateCollection(getHydratedPortfolio, controller.signal),
        ),
      );
      if (controller.signal.aborted) return;
      initialLoadCompleteRef.current = true;
      const loaded: Partial<Record<ListMode, boolean>> = {};
      results.forEach((result, index) => {
        const target = modes[index];
        if (result.status === "fulfilled") {
          loaded[target] = true;
        } else {
          logClientError(`Failed to load ${target} assets`, result.reason);
          if (target === mode) setError("Please try again in a moment.");
        }
      });
      setLoadedLists((current) => ({ ...current, ...loaded }));
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [mode, hydrateCollection, hydrateWatchlist]);

  function handleFeaturedFilter(value: string) {
    setFilter(value);
    requestAnimationFrame(() => {
      filterInputRef.current?.focus();
    });
  }

  function openProductSearch(
    productType: ProductType,
    trigger: HTMLButtonElement,
  ) {
    productSearchTriggerRef.current = trigger;
    setSearchProductType(productType);
    setProductSearchOpen(true);
  }

  useEffect(() => {
    const timer = hasCachedList
      ? undefined
      : window.setTimeout(() => void load(), 0);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const controller = requestControllerRef.current;
      requestControllerRef.current = null;
      controller?.abort();
    };
  }, [load, hasCachedList]);

  const visibleItems = useMemo(
    () => getVisiblePortfolioItems(items, filter, sort, changePeriod),
    [items, changePeriod, filter, sort],
  );
  const stats = useMemo(
    () => getPortfolioStats(items, changePeriod),
    [items, changePeriod],
  );
  const changePeriodLong = formatPriceChangePeriodLong(changePeriod);

  if (loading) return <PortfolioLoading mode={mode} />;

  const scopeControl = (
    <OverviewScopeControl
      ariaLabel="Saved list"
      onChange={(nextMode) => {
        if (nextMode === mode) return;
        restoreSelectorFocusRef.current = true;
        requestControllerRef.current?.abort();
        setLoading(!loadedLists[nextMode]);
        setError("");
        setQuantityDialogItemKey(null);
        if (nextMode === "watchlist" && sort === "holding-high")
          setSort("price-high");
        setMode(nextMode);
      }}
      options={LIST_OPTIONS}
      value={mode}
      missingPrices={
        loading || error
          ? 0
          : items.filter((item) => portfolioPrice(item) == null).length
      }
    />
  );

  return (
    <div className="portfolio">
      <PortfolioPageHeader
        mode={mode}
        actions={
          items.length === 0 && error ? (
            scopeControl
          ) : items.length > 0 && !error ? (
            <>
              <Button
                aria-expanded={
                  productSearchOpen && searchProductType === "sealed"
                }
                fill="ghost"
                onClick={(event) =>
                  openProductSearch("sealed", event.currentTarget)
                }
              >
                <Plus aria-hidden="true" /> Add sealed
              </Button>
              <Button
                aria-expanded={
                  productSearchOpen && searchProductType === "singles"
                }
                onClick={(event) =>
                  openProductSearch("singles", event.currentTarget)
                }
              >
                <Plus aria-hidden="true" /> Add singles
              </Button>
            </>
          ) : undefined
        }
      />

      {items.length > 0 && (
        <OverviewPanel
          ariaLabel={`${listLabel} summary`}
          className="portfolio__summary ui-scroll-reveal"
          ref={summaryRef}
        >
          <OverviewMetric
            className="portfolio__metric portfolio__metric--value"
            detail={scopeControl}
            label={`${listLabel} value`}
            primary
            value={
              <>
                {stats.pricedAssets > 0
                  ? formatPokeTraceMoney(stats.totalValue)
                  : "—"}
                {stats.changePercent != null && (
                  <PriceChange
                    ariaLabel={`${changePeriodLong} ${mode} value change ${formatSignedPercent(stats.changePercent)}`}
                    percent={stats.changePercent}
                    period={changePeriod}
                    title={`${changePeriodLong} ${mode} value change`}
                  />
                )}
              </>
            }
            valueClassName="portfolio__collection-value"
          />
          <OverviewMetric
            key={`assets:${stats.totalAssets}:${stats.singleAssets}:${stats.sealedAssets}`}
            className="portfolio__metric"
            detail={
              <>
                {integer.format(stats.singleAssets)}{" "}
                {stats.singleAssets === 1 ? "single" : "singles"}
                <br />
                {integer.format(stats.sealedAssets)} sealed
              </>
            }
            label="Assets"
            size="compact"
            value={integer.format(stats.totalAssets)}
          />
          <FeaturedAssetMetric
            key={`best:${stats.bestPerformer?.item.type ?? "none"}:${stats.bestPerformer?.item.id ?? "none"}:${stats.bestPerformer?.value ?? "none"}:${changePeriod}:${stats.bestPerformer?.change ?? "none"}`}
            item={stats.bestPerformer}
            label="Best performer"
            onFilter={handleFeaturedFilter}
            period={changePeriod}
            unavailableLabel="Price change unavailable"
          />
          <FeaturedAssetMetric
            breakBefore
            key={`weakest:${stats.weakestPerformer?.item.type ?? "none"}:${stats.weakestPerformer?.item.id ?? "none"}:${stats.weakestPerformer?.value ?? "none"}:${changePeriod}:${stats.weakestPerformer?.change ?? "none"}`}
            item={stats.weakestPerformer}
            label="Worst performer"
            onFilter={handleFeaturedFilter}
            period={changePeriod}
            unavailableLabel="Price change unavailable"
          />
          <FeaturedAssetMetric
            key={`valuable:${stats.mostValuable?.item.type ?? "none"}:${stats.mostValuable?.item.id ?? "none"}:${stats.mostValuable?.value ?? "none"}:${stats.mostValuable ? portfolioQuantity(stats.mostValuable.item) : 0}:${changePeriod}:${stats.mostValuable?.change ?? "none"}`}
            item={stats.mostValuable}
            label="Most valuable"
            onFilter={handleFeaturedFilter}
            period={changePeriod}
            unavailableLabel="No priced assets"
          />
        </OverviewPanel>
      )}

      {!loading && error && (
        <section className="portfolio__empty default-container" role="alert">
          <h2>We couldn&apos;t load your {mode}</h2>
          <p>{error}</p>
          <div className="portfolio__status-actions">
            <Button onClick={() => void load()}>Try again</Button>
            <Button fill="ghost" onClick={() => navigate("/search")}>
              Explore cards
            </Button>
          </div>
        </section>
      )}

      {missingItems.length > 0 && (
        <div
          className="portfolio__notice ui-scroll-reveal"
          ref={noticeRevealRef}
          role="status"
        >
          <AlertTriangle aria-hidden="true" />
          <span>
            {missingItems.length} saved{" "}
            {missingItems.length === 1 ? "asset is" : "assets are"} currently
            unavailable in the catalogue.
          </span>
        </div>
      )}

      {!loading &&
        !error &&
        (items.length === 0 ? (
          <section
            className="portfolio__empty portfolio__empty--list default-container ui-scroll-reveal"
            ref={summaryRef}
          >
            <div className="portfolio__empty-switch">{scopeControl}</div>
            <div className="portfolio__empty-content">
              <h2>
                {missingItems.length > 0
                  ? "No assets available"
                  : `Your ${mode} is empty`}
              </h2>
              <p>
                {missingItems.length > 0
                  ? "Your saved assets could not be loaded from the catalogue."
                  : `Add singles or sealed products to start tracking your ${mode}.`}
              </p>
              <div className="portfolio__status-actions">
                <Button
                  aria-expanded={
                    productSearchOpen && searchProductType === "singles"
                  }
                  onClick={(event) =>
                    openProductSearch("singles", event.currentTarget)
                  }
                >
                  <Plus aria-hidden="true" /> Add singles
                </Button>
                <Button
                  aria-expanded={
                    productSearchOpen && searchProductType === "sealed"
                  }
                  fill="ghost"
                  onClick={(event) =>
                    openProductSearch("sealed", event.currentTarget)
                  }
                >
                  <Plus aria-hidden="true" /> Add sealed
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section
              className="portfolio__controls ui-scroll-reveal"
              aria-label={`${listLabel} controls`}
              ref={controlsRevealRef}
            >
              <FilterInput
                ref={filterInputRef}
                ariaLabel={`Search your ${mode}`}
                className="portfolio__filter"
                clearLabel={`Clear ${mode} search`}
                id="portfolio-filter"
                onChange={setFilter}
                placeholder={`Search your ${mode}`}
                value={filter}
              />

              <div className="portfolio__control-group">
                <div className="portfolio__timeframe">
                  <PriceChangePeriodSelector
                    onChange={setChangePeriod}
                    value={changePeriod}
                  />
                </div>
                <div className="portfolio__sort-group">
                  <SelectDropdown
                    ariaLabel={`Sort ${mode} assets`}
                    className="portfolio__sort"
                    options={
                      isWatchlist
                        ? SORT_OPTIONS.filter(
                            (option) => option.value !== "holding-high",
                          )
                        : SORT_OPTIONS
                    }
                    value={sort}
                    onChange={setSort}
                  />
                </div>
              </div>
            </section>

            {visibleItems.length === 0 ? (
              <section
                className="portfolio__empty portfolio__empty--filtered ui-scroll-reveal"
                ref={emptyRevealRef}
              >
                <h2>No assets match your search</h2>
                <p>
                  Try another product name, set, number, rarity, or variant.
                </p>
              </section>
            ) : (
              <GridView>
                {visibleItems.map((item) => {
                  const itemKey = `${item.type}:${item.id}`;
                  const commonProps = {
                    comparisonPeriod: changePeriod,
                    quantityDialogOpen: quantityDialogItemKey === itemKey,
                    onQuantityDialogOpenChange: (open: boolean) =>
                      setQuantityDialogItemKey((current) =>
                        open ? itemKey : current === itemKey ? null : current,
                      ),
                    onRemoved: () =>
                      setQuantityDialogItemKey((current) =>
                        current === itemKey ? null : current,
                      ),
                  };
                  if (isWatchlist) {
                    return item.type === "single" ? (
                      <PokemonCardView
                        key={itemKey}
                        card={item}
                        comparisonPeriod={changePeriod}
                        comparisonPriceSnapshot={portfolioComparisonSnapshot(
                          item,
                          changePeriod,
                        )}
                      />
                    ) : (
                      <SealedProductView
                        key={itemKey}
                        product={item}
                        comparisonPeriod={changePeriod}
                      />
                    );
                  }
                  return item.type === "single" ? (
                    <PokemonCardPortfolioView
                      {...commonProps}
                      key={itemKey}
                      card={item}
                      comparisonPriceSnapshot={portfolioComparisonSnapshot(
                        item,
                        changePeriod,
                      )}
                    />
                  ) : (
                    <SealedProductPortfolioView
                      {...commonProps}
                      key={itemKey}
                      product={item}
                    />
                  );
                })}
              </GridView>
            )}
          </>
        ))}

      <EmbeddedCardSearchDialog
        ariaLabel={`Add ${searchProductType}${isWatchlist ? " to watchlist" : ""}`}
        initialProductType={searchProductType}
        isOpen={productSearchOpen}
        onClose={() => setProductSearchOpen(false)}
        returnFocusRef={productSearchTriggerRef}
      />
    </div>
  );
}

export default function Portfolio() {
  const { user, loading } = useAuth();

  if (loading) return <PortfolioLoading showHeader={false} />;
  if (!user) return <PortfolioGuest />;

  return <PortfolioList key={user.uid} />;
}
