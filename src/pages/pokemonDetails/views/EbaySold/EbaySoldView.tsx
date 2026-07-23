import { useEffect, useState } from "react";
import type { PokemonCard } from "../../../../types/pokemon";
import type { PaidFeatureResponse, UserSubscription } from "../../../../subscriptions/types";
import { authenticatedFetch } from "../../../../utils/authenticatedFetch";
import {
  getVisibleEbayCompResults,
  type EbayCompsResponse,
  type EbayCompResult,
} from "../../../../utils/ebayComps";
import {
  CalendarDays,
  ExternalLink,
  Gavel,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import "./EbaySoldView.scss";
import {
  isAbortError,
  useAbortableRequest,
} from "../../../../hooks/useAbortableRequest";
import { waitForStoredResponse } from "../../../../utils/waitForStoredResponse";
import { LoadingState } from "../../../../components/loadingState/LoadingState";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type EbaySoldViewProps = {
  card: PokemonCard;
  onSubscriptionChange?: (subscription: UserSubscription) => void;
};

type EbaySortOrder =
  | "default"
  | "price-asc"
  | "price-desc"
  | "date-desc"
  | "date-asc";

const FEATURED_FIELDS = new Set([
  "url",
  "title",
  "condition",
  "bidcount",
  "endedat",
  "soldprice",
  "soldcurrency",
  "sellerusername",
  "sellerpositivepercent",
  "sellerfeedbackscore",
  "itemlocation",
  "listingtype",
]);

function getField(result: EbayCompResult, key: string) {
  return result.fields.find((field) => field.key.toLowerCase() === key.toLowerCase())?.value;
}

function formatPrice(price?: string, currency?: string) {
  if (!price) return "Price unavailable";

  const numericPrice = Number(price.replace(/,/g, ""));
  if (!Number.isFinite(numericPrice) || !currency) {
    return [price, currency].filter(Boolean).join(" ");
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(numericPrice);
  } catch {
    return `${price} ${currency}`;
  }
}

function formatDate(value?: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatFieldLabel(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function getNumericSoldPrice(result: EbayCompResult) {
  const price = getField(result, "soldPrice");
  if (!price) return null;

  const numericPrice = Number(price.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericPrice) ? numericPrice : null;
}

function getEndedAtTimestamp(result: EbayCompResult) {
  const endedAt = getField(result, "endedAt");
  if (!endedAt) return null;

  const timestamp = Date.parse(endedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatHeadline(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split(/([\s-]+)/)
    .map((word) => word.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("en-US")))
    .join("");
}

export default function EbaySoldView({
  card,
  onSubscriptionChange,
}: EbaySoldViewProps) {
  const [response, setResponse] = useState<EbayCompsResponse>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortOrder, setSortOrder] = useState<EbaySortOrder>("default");
  const { isCurrentRequest, startRequest } = useAbortableRequest();
  useEffect(() => {
    async function loadSoldListings() {
      const params = new URLSearchParams({ cardId: card.id });
      const signal = startRequest();

      setLoading(true);
      setError("");
      setResponse(null);
      setSortOrder("default");

      try {
        const res = await authenticatedFetch(`${API_URL}/ebay?${params.toString()}`, {
          signal,
        });
        const data = (await res.json()) as
          Partial<PaidFeatureResponse<EbayCompsResponse>> & {
            error?: string;
            fromDatabase?: boolean;
            message?: string;
          };

        if (!res.ok) {
          throw new Error(
            data?.error ?? data?.message ?? "Failed to fetch eBay sold listings",
          );
        }

        if (!data.subscription) {
          throw new Error("The eBay response did not include subscription data");
        }
        onSubscriptionChange?.(data.subscription);
        if (data.fromDatabase) {
          await waitForStoredResponse(signal);
        }
        if (!signal.aborted) {
          setResponse(data.data);
        }
      } catch (requestError) {
        if (isAbortError(requestError)) return;
        if (!signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to fetch eBay sold listings"
          );
        }
      } finally {
        if (isCurrentRequest(signal)) {
          setLoading(false);
        }
      }
    }

    loadSoldListings();
  }, [card.id, isCurrentRequest, onSubscriptionChange, startRequest]);

  if (loading) {
    return <LoadingState>Loading eBay sold listings...</LoadingState>;
  }
  if (error) return <p className="card-view__page-error">{error}</p>;

  const results = getVisibleEbayCompResults(response);

  if (!results.length) {
    return <p className="ebay-sold-view__state">No eBay sold listings found.</p>;
  }

  const sortedResults = sortOrder === "default"
    ? results
    : [...results].sort((firstResult, secondResult) => {
        const sortingByDate = sortOrder === "date-desc" || sortOrder === "date-asc";
        const firstValue = sortingByDate
          ? getEndedAtTimestamp(firstResult)
          : getNumericSoldPrice(firstResult);
        const secondValue = sortingByDate
          ? getEndedAtTimestamp(secondResult)
          : getNumericSoldPrice(secondResult);

        if (firstValue === null && secondValue === null) return 0;
        if (firstValue === null) return 1;
        if (secondValue === null) return -1;

        return sortOrder === "price-asc" || sortOrder === "date-asc"
          ? firstValue - secondValue
          : secondValue - firstValue;
      });

  return (
    <div className="ebay-sold-view ui-render-fade">
      <div className="ebay-sold-view__sorting">
        <label htmlFor="ebay-sold-sort">Sort by</label>
        <select
          id="ebay-sold-sort"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as EbaySortOrder)}
        >
          <option value="default">Default</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="date-desc">Newest</option>
          <option value="date-asc">Oldest</option>
        </select>
      </div>
      <div className="ebay-sold-view__results ui-render-fade" key={sortOrder}>
        {sortedResults.map((result, index) => {
          const title = getField(result, "title") ?? "eBay sold listing";
          const url = getField(result, "url");
          const condition = getField(result, "condition");
          const bidCount = getField(result, "bidCount");
          const endedAt = getField(result, "endedAt");
          const seller = getField(result, "sellerUsername");
          const sellerPositive = getField(result, "sellerPositivePercent");
          const feedbackScore = getField(result, "sellerFeedbackScore");
          const location = getField(result, "itemLocation");
          const soldPrice = formatPrice(
            getField(result, "soldPrice"),
            getField(result, "soldCurrency"),
          );
          const additionalFields = result.fields.filter(
            (field) => !FEATURED_FIELDS.has(field.key.toLowerCase()),
          );
          const hasListingUrl = Boolean(url && /^https?:\/\//i.test(url));

          return (
            <article
              key={url ?? `${title}-${index}`}
              className="ebay-sold-view__result card-hover"
            >
              <div className="ebay-sold-view__visual">
                <div className="ebay-sold-view__media">
                  {result.thumbnailUrl ? (
                    <img src={result.thumbnailUrl} alt={title} />
                  ) : (
                    <Gavel aria-hidden="true" />
                  )}
                </div>
              </div>

              <div className="ebay-sold-view__content">
                <header className="ebay-sold-view__header">
                  <div>
                    <h3>{formatHeadline(title)}</h3>
                    <div className="ebay-sold-view__badges">
                      {condition && (
                        <span className="ebay-sold-view__condition">{condition}</span>
                      )}
                      {bidCount && bidCount !== "N/A" && (
                        <span><Gavel aria-hidden="true" /> {bidCount} bids</span>
                      )}
                      <span><CalendarDays aria-hidden="true" /> Sold {formatDate(endedAt)}</span>
                    </div>
                  </div>
                  <div className="ebay-sold-view__price">
                    <div className="ebay-sold-view__price-row">
                      <div className="ebay-sold-view__sold-badge">
                        <small>Sold</small>
                      </div>
                      <strong>{soldPrice}</strong>
                    </div>
                    {hasListingUrl && (
                      <a
                        className="ebay-sold-view__sale-link"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View sale <ExternalLink aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </header>

                <div className="ebay-sold-view__details">
                  {seller && (
                    <div>
                      <span>Seller<strong><ShieldCheck aria-hidden="true" />{seller}</strong></span>
                    </div>
                  )}
                  {sellerPositive && (
                    <div>
                      <span>Positive feedback<strong>{sellerPositive}%</strong></span>
                    </div>
                  )}
                  {feedbackScore && (
                    <div>
                      <span>Feedback score<strong>{feedbackScore}</strong></span>
                    </div>
                  )}
                  {location && (
                    <div>
                      <span>Item location<strong><MapPin aria-hidden="true" />{location}</strong></span>
                    </div>
                  )}
                </div>

                {additionalFields.length > 0 && (
                  <dl className="ebay-sold-view__extra-fields">
                    {additionalFields.map((field) => (
                      <div key={field.key}>
                        <dt>{formatFieldLabel(field.key)}</dt>
                        <dd>{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
