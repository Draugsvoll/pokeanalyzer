import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  isPokeTraceSealedCatalogProduct,
  isPokeTraceSealedDetails,
  type PokeTraceSealedCatalogProduct,
  type PokeTraceSealedMarketHistory,
  type PokeTraceSealedMarketplacePricing,
} from "../../../shared/pokeTraceSealed";
import { Badge } from "../../components/ui/Badge";
import { DetailsPage } from "../../components/detailsPage/DetailsPage";
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

function SealedMarketplacePrice({
  currency,
  label,
  price,
  pricing,
  url,
}: {
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
                <div className="sealed-details__price-value">
                  <strong>{formatMoney(price, currency)}</strong>
                  <span className="sealed-details__condition">Unopened</span>
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
  productId,
}: {
  currency: string;
  productId: string;
}) {
  const [request, setRequest] = useState<{
    history: PokeTraceSealedMarketHistory | null;
    id: string;
    loading: boolean;
  }>({ history: null, id: productId, loading: true });
  const matchesProduct = request.id === productId;

  useEffect(() => {
    const controller = new AbortController();
    void fetchSealedMarketPriceHistory(productId, controller.signal)
      .then((history) => {
        setRequest({ history, id: productId, loading: false });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setRequest({ history: null, id: productId, loading: false });
      });
    return () => controller.abort();
  }, [productId]);

  if (!matchesProduct || request.loading) {
    return <MarketPriceHistoryLoading conditionLabel="Unopened" />;
  }
  return (
    <MarketPriceHistoryChart
      conditionLabel="Unopened"
      emptyDescription="Historical prices are not available for this sealed product yet."
      history={request.history ?? { currency, series: {}, stale: false }}
    />
  );
}

export default function SealedDetails() {
  const { id } = useParams();
  const location = useLocation();
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
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
              currency={product.currency}
              label="TCGPlayer"
              price={product.price}
              pricing={tcgplayerPricing}
              url={details?.marketplaceUrls.tcgplayer}
            />
            <SealedMarketplacePrice
              currency={product.currency}
              label="eBay"
              price={ebayPricing?.price ?? null}
              pricing={ebayPricing}
              url={details?.marketplaceUrls.ebay}
            />
          </div>
          <SealedPriceHistory
            currency={product.currency}
            productId={product.id}
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
      }
      notice={
        error ? <p className="sealed-details__notice">{error}</p> : undefined
      }
      title={product.name}
      titleMeta={
        <Badge accent="neutral" size="sm">
          {product.productFamily.replaceAll("_", " ")}
        </Badge>
      }
    />
  );
}
