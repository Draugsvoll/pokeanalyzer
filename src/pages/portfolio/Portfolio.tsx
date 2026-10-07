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
import type { ProductType } from "../../components/productTypeSwitch/ProductTypeSwitch";
import { SealedProductPortfolioView } from "../../components/sealedProductView/SealedProductView";
import { SelectDropdown } from "../../components/selectDropdown/SelectDropdown";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { getHydratedPortfolio } from "../../services/portfolioApi";
import type {
  PortfolioComparisonPeriod,
  PortfolioItem,
  PortfolioReference,
} from "../../types/portfolio";
import { logClientError } from "../../utils/logClientError";
import {
  getPortfolioStats,
  getVisiblePortfolioItems,
  portfolioCurrency,
  portfolioItemNumber,
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
  { value: "change-high", label: "% Change: high–low" },
  { value: "change-low", label: "% Change: low–high" },
];

const CHANGE_PERIOD_OPTIONS: Array<{
  value: PortfolioComparisonPeriod;
  label: string;
}> = PRICE_CHANGE_PERIODS.map((value) => ({
  label: formatPriceChangePeriodLabel(value).toUpperCase(),
  value,
}));

function formatMoney(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      style: "currency",
    }).format(value);
  } catch {
    return `${currency} ${money.format(value)}`;
  }
}

function formatSignedPercent(value: number) {
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

type FeaturedAssetMetricProps = {
  item: PortfolioFeaturedMetric | null;
  label: string;
  period: PortfolioComparisonPeriod;
  unavailableLabel: string;
};

function FeaturedAssetMetric({
  item,
  label,
  period,
  unavailableLabel,
}: FeaturedAssetMetricProps) {
  const itemNumber = item ? portfolioItemNumber(item.item) : undefined;
  const periodLong = formatPriceChangePeriodLong(period);

  return (
    <OverviewMetric
      className="portfolio__metric ui-render-fade"
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
          {item ? formatMoney(item.value, portfolioCurrency(item.item)) : "—"}
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

function PortfolioPageHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="portfolio__page-header">
      <div>
        <span className="portfolio__eyebrow">Portfolio</span>
        <h1>My collection</h1>
      </div>
      {actions && <div className="portfolio__page-actions">{actions}</div>}
    </header>
  );
}

function PortfolioLoading({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <div className="portfolio portfolio--loading" aria-busy="true">
      {showHeader && <PortfolioPageHeader />}
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

function PortfolioForCurrentUser({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { replacePortfolioReferences } = usePortfolioCache();
  const requestControllerRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [missingItems, setMissingItems] = useState<PortfolioReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<PortfolioSort>("unsorted");
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [searchProductType, setSearchProductType] =
    useState<ProductType>("singles");
  const [quantityDialogItemKey, setQuantityDialogItemKey] = useState<
    string | null
  >(null);
  const productSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const productSearchChangedPortfolioRef = useRef(false);
  const [changePeriod, setChangePeriod] =
    useState<PortfolioComparisonPeriod>("7d");
  const summaryRevealRef = useScrollReveal<HTMLElement>();
  const noticeRevealRef = useScrollReveal<HTMLDivElement>();
  const emptyRevealRef = useScrollReveal<HTMLElement>();
  const controlsRevealRef = useScrollReveal<HTMLElement>();
  const load = useCallback(
    async (showLoading = true) => {
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const response = await getHydratedPortfolio(userId, controller.signal);
        if (controller.signal.aborted) return;
        setItems(response.items);
        setMissingItems(response.missingItems);
        replacePortfolioReferences(response.entries);
      } catch (cause) {
        if (controller.signal.aborted) return;
        logClientError("Failed to load portfolio assets", cause);
        setError("Please try again in a moment.");
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [replacePortfolioReferences, userId],
  );

  const closeProductSearch = useCallback(() => {
    setProductSearchOpen(false);
    if (!productSearchChangedPortfolioRef.current) return;

    productSearchChangedPortfolioRef.current = false;
    void load(false);
  }, [load]);

  function openProductSearch(
    productType: ProductType,
    trigger: HTMLButtonElement,
  ) {
    productSearchTriggerRef.current = trigger;
    setSearchProductType(productType);
    setProductSearchOpen(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      const controller = requestControllerRef.current;
      requestControllerRef.current = null;
      controller?.abort();
    };
  }, [load]);

  const visibleItems = useMemo(
    () => getVisiblePortfolioItems(items, filter, sort, changePeriod),
    [items, changePeriod, filter, sort],
  );
  const stats = useMemo(
    () => getPortfolioStats(items, changePeriod),
    [items, changePeriod],
  );
  const changePeriodLong = formatPriceChangePeriodLong(changePeriod);

  if (loading) return <PortfolioLoading />;

  if (error) {
    return (
      <div className="portfolio">
        <PortfolioPageHeader />
        <section className="portfolio__empty default-container" role="alert">
          <h2>We couldn&apos;t load your collection</h2>
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
      {items.length > 0 && (
        <PortfolioPageHeader
          actions={
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
          }
        />
      )}

      {items.length > 0 && (
        <OverviewPanel
          ariaLabel="Collection summary"
          className="portfolio__summary ui-scroll-reveal"
          layout="two-featured"
          ref={summaryRevealRef}
        >
          <OverviewMetric
            key={`value:${stats.totalValue}:${stats.pricedAssets}:${stats.totalAssets}`}
            className="portfolio__metric portfolio__metric--value ui-render-fade"
            detail={
              stats.excludedCurrencyAssets > 0
                ? `${stats.excludedCurrencyAssets} assets use another currency`
                : stats.pricedAssets === stats.totalAssets
                  ? "TCGPlayer reference prices"
                  : `${stats.pricedAssets} of ${stats.totalAssets} assets have reference prices`
            }
            label="Collection value"
            value={
              <>
                {stats.totalValue > 0
                  ? formatMoney(stats.totalValue, stats.valueCurrency)
                  : "—"}
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
            key={`assets:${stats.totalAssets}:${stats.singleAssets}:${stats.sealedAssets}`}
            className="portfolio__metric ui-render-fade"
            detail={`${integer.format(stats.singleAssets)} ${stats.singleAssets === 1 ? "single" : "singles"} · ${integer.format(stats.sealedAssets)} sealed`}
            label="Assets"
            value={integer.format(stats.totalAssets)}
          />
          <FeaturedAssetMetric
            key={`gainer:${stats.biggestGainer?.item.type ?? "none"}:${stats.biggestGainer?.item.id ?? "none"}:${stats.biggestGainer?.value ?? "none"}:${changePeriod}:${stats.biggestGainer?.change ?? "none"}`}
            item={stats.biggestGainer}
            label="Biggest gainer"
            period={changePeriod}
            unavailableLabel="Price change unavailable"
          />
          <FeaturedAssetMetric
            key={`top:${stats.topHolding?.item.type ?? "none"}:${stats.topHolding?.item.id ?? "none"}:${stats.topHolding?.value ?? "none"}:${stats.topHolding ? portfolioQuantity(stats.topHolding.item) : 0}:${changePeriod}:${stats.topHolding?.change ?? "none"}`}
            item={stats.topHolding}
            label="Top holding"
            period={changePeriod}
            unavailableLabel="No priced assets"
          />
        </OverviewPanel>
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

      {items.length === 0 ? (
        <section
          className="portfolio__empty default-container ui-scroll-reveal"
          ref={emptyRevealRef}
        >
          <h2>
            {missingItems.length > 0
              ? "No assets available"
              : "Your collection is empty"}
          </h2>
          <p>
            {missingItems.length > 0
              ? "Your saved assets could not be loaded from the catalogue."
              : "Add singles or sealed products to start tracking your collection."}
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
                  ariaLabel="Sort portfolio assets"
                  className="portfolio__sort"
                  options={SORT_OPTIONS}
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
              <p>Try another product name, set, number, rarity, or variant.</p>
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
                  onQuantityUpdated: (id: string, nextQuantity: number) =>
                    setItems((current) =>
                      current.map((candidate) =>
                        candidate.type === item.type && candidate.id === id
                          ? { ...candidate, quantity: nextQuantity }
                          : candidate,
                      ),
                    ),
                  onRemoved: (id: string) => {
                    setItems((current) =>
                      current.filter(
                        (candidate) =>
                          candidate.type !== item.type || candidate.id !== id,
                      ),
                    );
                    setQuantityDialogItemKey((current) =>
                      current === itemKey ? null : current,
                    );
                  },
                };
                return item.type === "single" ? (
                  <PokemonCardPortfolioView
                    {...commonProps}
                    key={itemKey}
                    card={item}
                    comparisonPriceSnapshot={
                      item.priceSnapshots?.[changePeriod] ?? null
                    }
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
      )}

      <EmbeddedCardSearchDialog
        ariaLabel={`Add ${searchProductType}`}
        initialProductType={searchProductType}
        isOpen={productSearchOpen}
        onClose={closeProductSearch}
        onPortfolioChanged={() => {
          productSearchChangedPortfolioRef.current = true;
        }}
        returnFocusRef={productSearchTriggerRef}
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
