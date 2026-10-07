import { ArrowUp, ExternalLink, Repeat2, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  isPokeTraceSealedCatalogProduct,
  isPokeTraceSealedDetails,
  type PokeTraceSealedCatalogProduct,
  type PokeTraceSealedMarketHistory,
  type PokeTraceSealedMarketHistorySource,
  type PokeTraceSealedMarketplacePricing,
} from "../../../shared/pokeTraceSealed";
import { formatPriceChangePeriodLong } from "../../../shared/priceChangePeriod";
import { calculateDisplayedPriceChangePercent } from "../../../shared/pokeTracePriceChange";
import { Badge } from "../../components/ui/Badge";
import Button from "../../components/button/Button";
import { DetailsPage } from "../../components/detailsPage/DetailsPage";
import { EmbeddedCardSearchDialog } from "../../components/embeddedCardSearchDialog/EmbeddedCardSearchDialog";
import { PriceChange } from "../../components/priceChange/PriceChange";
import { useAuth } from "../../context/authContextValue";
import { usePortfolioCache } from "../../context/portfolioCacheContextValue";
import { useSealedPortfolio } from "../../hooks/sealedPortfolio";
import {
  fetchSealedMarketPriceHistory,
  fetchSealedProduct,
} from "../../services/sealedApi";
import {
  MarketPriceHistoryChart,
  MarketPriceHistoryLoading,
} from "../pokemonDetails/components/MarketPriceHistoryChart";
import { MarketDataUnavailable } from "../pokemonDetails/components/MarketDataUnavailable";
import "./SealedDetails.scss";

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      style: "currency",
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function navigationProduct(value: unknown, id: string | undefined) {
  if (!value || typeof value !== "object" || !id) return null;
  const product = (value as { product?: unknown }).product;
  return isPokeTraceSealedCatalogProduct(product) && product.id === id
    ? product
    : null;
}

type SealedPriceHistoryRequest = {
  history: PokeTraceSealedMarketHistory | null;
  id: string;
  loading: boolean;
};

function useSealedPriceHistory(productId: string) {
  const [request, setRequest] = useState<SealedPriceHistoryRequest>({
    history: null,
    id: productId,
    loading: Boolean(productId),
  });

  useEffect(() => {
    if (!productId) {
      setRequest({ history: null, id: productId, loading: false });
      return;
    }

    const controller = new AbortController();
    void fetchSealedMarketPriceHistory(productId, controller.signal)
      .then((history) => {
        setRequest({ history, id: productId, loading: false });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRequest({ history: null, id: productId, loading: false });
      });
    return () => controller.abort();
  }, [productId]);

  return {
    history: request.id === productId ? request.history : null,
    loading: request.id !== productId || request.loading,
  };
}

function dateDaysBefore(date: string, days: number) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function resolveSealedSevenDayPriceChange(
  history: PokeTraceSealedMarketHistory | null,
  source: PokeTraceSealedMarketHistorySource,
  currentPrice: number | null | undefined,
) {
  const points = history?.series[source] ?? [];
  const latestDate = points.at(-1)?.date;
  if (!latestDate) return null;

  const comparison = [7, 8, 6]
    .map((days) => dateDaysBefore(latestDate, days))
    .filter((date): date is string => date !== null)
    .map((date) => points.find((point) => point.date === date))
    .find((point) => point !== undefined);
  return calculateDisplayedPriceChangePercent(currentPrice, comparison?.avg);
}

function SealedMarketplacePrice({
  change,
  currency,
  label,
  price,
  pricing,
  url,
}: {
  change?: number | null;
  currency: string;
  label: "eBay" | "TCGPlayer";
  price: number | null;
  pricing?: PokeTraceSealedMarketplacePricing;
  url?: string;
}) {
  const sourceClass = label === "eBay" ? "ebay" : "tcgplayer";
  return (
    <article className="poketrace-market__marketplace default-container-inner">
      <div className="poketrace-market__source-heading">
        <h4
          className={`poketrace-market__source-title poketrace-market__source-title--${sourceClass}`}
        >
          {label}
        </h4>
        <span className="sealed-details__condition">Unopened</span>
      </div>
      {price === null ? (
        <MarketDataUnavailable
          className="poketrace-market__marketplace-unavailable"
          description={`No recent ${label} unopened prices were found.`}
          title="No price data"
        />
      ) : (
        <div className="poketrace-market__condition-data">
          <div className="poketrace-market__primary">
            <div className="poketrace-market__quote">
              <div className="poketrace-market__price-row">
                <div className="poketrace-market__price-summary">
                  <strong>{formatMoney(price, currency)}</strong>
                  {change !== undefined && (
                    <PriceChange
                      percent={change}
                      period="7d"
                      title={`${formatPriceChangePeriodLong("7d")} ${label} unopened price change`}
                    />
                  )}
                </div>
                {url && (
                  <a
                    aria-label={`Buy on ${label}`}
                    className={`poketrace-market__market-link poketrace-market__market-link--${sourceClass}`}
                    href={url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Buy <ExternalLink aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <dl className="poketrace-market__range">
            <div>
              <dt>Low</dt>
              <dd>
                {typeof pricing?.low === "number"
                  ? formatMoney(pricing.low, currency)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>High</dt>
              <dd>
                {typeof pricing?.high === "number"
                  ? formatMoney(pricing.high, currency)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Sales</dt>
              <dd>
                {pricing?.saleCount == null
                  ? "—"
                  : `${pricing.saleCount}${pricing.approxSaleCount ? "+" : ""}`}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </article>
  );
}

function SealedPriceHistory({
  currency,
  history,
  loading,
}: {
  currency: string;
  history: PokeTraceSealedMarketHistory | null;
  loading: boolean;
}) {
  if (loading) {
    return <MarketPriceHistoryLoading conditionLabel="Unopened" />;
  }
  return (
    <MarketPriceHistoryChart
      conditionLabel="Unopened"
      emptyDescription="Historical prices are not available for this sealed product yet."
      history={history ?? { currency, series: {}, stale: false }}
    />
  );
}

export default function SealedDetails() {
  const { id } = useParams();
  const location = useLocation();
  const { user: authUser } = useAuth();
  const { isItemSaved, loadingPortfolioReferences, portfolioReferencesError } =
    usePortfolioCache();
  const { saveSealedToPortfolio, removeSealedFromPortfolio } =
    useSealedPortfolio();
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const [sealedSearchProductId, setSealedSearchProductId] = useState<
    string | null
  >(null);
  const sealedSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const showSealedSearch = Boolean(id && sealedSearchProductId === id);
  const closeEmbeddedSearch = useCallback(() => {
    setSealedSearchProductId(null);
  }, []);
  const initialProduct = useMemo(
    () => navigationProduct(location.state, id),
    [id, location.state],
  );
  const [request, setRequest] = useState<{
    error: string | null;
    id: string | undefined;
    loading: boolean;
    product: PokeTraceSealedCatalogProduct | null;
  }>({
    error: null,
    id,
    loading: Boolean(id && !initialProduct),
    product: initialProduct,
  });
  const requestMatchesRoute = request.id === id;
  const product = requestMatchesRoute ? request.product : initialProduct;
  const loading = requestMatchesRoute ? request.loading : Boolean(id);
  const error = requestMatchesRoute ? request.error : null;
  const details = product && isPokeTraceSealedDetails(product) ? product : null;
  const tcgplayerPricing = details?.pricing.tcgplayer;
  const ebayPricing = details?.pricing.ebay;
  const sealedPriceHistory = useSealedPriceHistory(product?.id ?? "");
  const tcgplayerPriceChange = calculateDisplayedPriceChangePercent(
    product?.price,
    product?.priceSnapshots["7d"],
  );
  const ebayPriceChange = resolveSealedSevenDayPriceChange(
    sealedPriceHistory.history,
    "ebay",
    ebayPricing?.price,
  );
  const productIsSaved = product ? isItemSaved("sealed", product.id) : false;
  const portfolioBusy =
    updatingPortfolio || (Boolean(authUser) && loadingPortfolioReferences);
  const portfolioUnavailable =
    Boolean(authUser) && Boolean(portfolioReferencesError);

  async function handlePortfolioToggle() {
    if (
      !product ||
      updatingPortfolio ||
      loadingPortfolioReferences ||
      portfolioUnavailable
    ) {
      return;
    }
    setUpdatingPortfolio(true);
    try {
      if (productIsSaved) {
        await removeSealedFromPortfolio(product.id, false);
      } else {
        await saveSealedToPortfolio(product);
      }
    } finally {
      setUpdatingPortfolio(false);
    }
  }

  function handleEmbeddedSearchToggle() {
    setSealedSearchProductId(showSealedSearch ? null : (id ?? null));
  }

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void fetchSealedProduct(id, controller.signal)
      .then((nextProduct) => {
        setRequest({
          error: null,
          id,
          loading: false,
          product: nextProduct,
        });
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setRequest({
          error:
            requestError instanceof Error
              ? requestError.message
              : "Failed to load sealed product",
          id,
          loading: false,
          product: initialProduct,
        });
      });
    return () => controller.abort();
  }, [id, initialProduct]);

  if (loading && !product) {
    return (
      <div aria-busy="true" className="route-loading" role="status">
        <span aria-hidden="true" className="app-loading-spinner" />
      </div>
    );
  }
  if (!product) {
    return (
      <section className="sealed-details sealed-details--message">
        <h1>Sealed product unavailable</h1>
        <p>{error ?? "This sealed product could not be found."}</p>
        <Link to="/sealed">Back to sealed search</Link>
      </section>
    );
  }

  return (
    <DetailsPage
      breadcrumbs={[
        { label: "Sealed products", to: "/sealed" },
        {
          label: product.setName,
          to: `/sealed?set=${encodeURIComponent(product.setName)}`,
        },
        { label: product.name },
      ]}
      className="sealed-details ui-render-fade"
      content={
        <section aria-label="Market prices" className="poketrace-market">
          <div className="poketrace-market__grid">
            <SealedMarketplacePrice
              change={tcgplayerPriceChange}
              currency={product.currency}
              label="TCGPlayer"
              price={product.price}
              pricing={tcgplayerPricing}
              url={details?.marketplaceUrls.tcgplayer}
            />
            <SealedMarketplacePrice
              change={ebayPriceChange}
              currency={product.currency}
              label="eBay"
              price={ebayPricing?.price ?? null}
              pricing={ebayPricing}
              url={details?.marketplaceUrls.ebay}
            />
          </div>
          <SealedPriceHistory
            currency={product.currency}
            history={sealedPriceHistory.history}
            loading={sealedPriceHistory.loading}
          />
        </section>
      }
      headerAside={
        product.variant ? (
          <span className="sealed-details__variant">
            {product.variant.replaceAll("_", " ")}
          </span>
        ) : undefined
      }
      media={
        <>
          <div className="sealed-details__image-frame">
            {product.image && failedImageSrc !== product.image && (
              <img
                alt={product.name}
                onError={(event) => {
                  event.currentTarget.hidden = true;
                  setFailedImageSrc(product.image ?? null);
                }}
                src={product.image}
              />
            )}
          </div>
          {authUser && (
            <Button
              aria-busy={portfolioBusy}
              aria-label={
                portfolioUnavailable
                  ? "Portfolio is unavailable"
                  : portfolioBusy
                    ? "Updating portfolio"
                    : productIsSaved
                      ? "Remove from portfolio"
                      : "Add to portfolio"
              }
              aria-pressed={productIsSaved}
              disabled={portfolioBusy || portfolioUnavailable}
              fullWidth
              onClick={() => void handlePortfolioToggle()}
              size="large"
              variant="portfolio"
            >
              {portfolioBusy ? (
                <span className="app-btn__spinner" aria-hidden="true" />
              ) : (
                <>
                  <Star aria-hidden="true" />
                  <span>Portfolio</span>
                </>
              )}
            </Button>
          )}
          <div className="sealed-details__change-product">
            <Button
              aria-expanded={showSealedSearch}
              fill="ghost"
              fullWidth
              onClick={handleEmbeddedSearchToggle}
              ref={sealedSearchTriggerRef}
              size="large"
            >
              {showSealedSearch ? (
                <>
                  <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
                  <span>Close</span>
                </>
              ) : (
                <>
                  <Repeat2 size={16} strokeWidth={2.25} aria-hidden="true" />
                  <span>Next Sealed</span>
                </>
              )}
            </Button>
          </div>
        </>
      }
      notice={
        error ? <p className="sealed-details__notice">{error}</p> : undefined
      }
      title={product.name}
      titleMeta={
        <span className="sealed-details__product-family-badge">
          <Badge accent="neutral" size="md" weight="strong">
            {product.productFamily.replaceAll("_", " ")}
          </Badge>
        </span>
      }
    >
      <EmbeddedCardSearchDialog
        ariaLabel="Switch sealed product"
        initialProductType="sealed"
        isOpen={showSealedSearch}
        onClose={closeEmbeddedSearch}
        returnFocusRef={sealedSearchTriggerRef}
      />
    </DetailsPage>
  );
}
