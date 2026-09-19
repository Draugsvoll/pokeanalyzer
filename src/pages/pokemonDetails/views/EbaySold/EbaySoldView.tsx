import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PokemonCard } from "../../../../types/pokemon";
import type {
  PaidFeatureResponse,
  UserSubscription,
} from "../../../../subscriptions/types";
import { authenticatedFetch } from "../../../../utils/authenticatedFetch";
import {
  getVisibleEbayCompResults,
  type EbayCompsResponse,
  type EbayCompResult,
} from "../../../../utils/ebayComps";
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Gavel,
  Search,
} from "lucide-react";
import "./EbaySoldView.scss";
import {
  isAbortError,
  useAbortableRequest,
} from "../../../../hooks/useAbortableRequest";
import { waitForStoredResponse } from "../../../../utils/waitForStoredResponse";
import { FEATURE_ERROR_MESSAGE } from "../featureError";
import { LoadingState } from "../../../../components/loadingState/LoadingState";
import { SelectDropdown } from "../../../../components/selectDropdown/SelectDropdown";
import { SegmentedRadioGroup } from "../../../../components/ui/SegmentedRadioGroup";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const RESULTS_BATCH_SIZE = 25;
const FILTER_TRANSITION_MS = 250;

type EbaySoldViewProps = {
  card: PokemonCard;
  demoResponse?: Record<string, unknown>;
  runToken: number;
  onSubscriptionChange?: (subscription: UserSubscription) => void;
  onLoadingChange?: (loading: boolean) => void;
  onReportAvailableChange?: (available: boolean) => void;
};

type EbaySortOrder = "price-asc" | "price-desc" | "date-desc" | "date-asc";
type ListingTypeFilter = "sold" | "active";
type GradeFilter = "all" | "raw" | "7" | "8" | "9" | "10";

const EBAY_SORT_OPTIONS: { value: EbaySortOrder; label: string }[] = [
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "date-desc", label: "Newest" },
  { value: "date-asc", label: "Oldest" },
];
const GRADE_FILTERS: { value: GradeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "raw", label: "Raw" },
  { value: "7", label: "Grade 7" },
  { value: "8", label: "Grade 8" },
  { value: "9", label: "Grade 9" },
  { value: "10", label: "Grade 10" },
];

function getField(result: EbayCompResult, key: string) {
  const value = result.fields.find(
    (field) => field.key.toLowerCase() === key.toLowerCase(),
  )?.value;
  const normalizedValue = value?.trim().toLowerCase();

  if (
    !normalizedValue ||
    normalizedValue === "n/a" ||
    normalizedValue === "na" ||
    normalizedValue === "null" ||
    normalizedValue === "undefined"
  ) {
    return undefined;
  }

  return value;
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

function getNumericSoldPrice(result: EbayCompResult) {
  const price =
    getField(result, "soldPrice") ?? getField(result, "currentPrice");
  if (!price) return null;

  const numericPrice = Number(price.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericPrice) ? numericPrice : null;
}

function getEndedAtTimestamp(result: EbayCompResult) {
  const endedAt = getField(result, "endedAt") ?? getField(result, "scrapedAt");
  if (!endedAt) return null;

  const timestamp = Date.parse(endedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatHeadline(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split(/([\s-]+)/)
    .map((word) =>
      word.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("en-US")),
    )
    .join("");
}

function isTrue(value?: string) {
  return value?.trim().toLowerCase() === "true";
}

type EbayResultCardProps = {
  result: EbayCompResult;
  index: number;
  isActive: boolean;
};

type EbayListingMetadataItem = {
  icon?: ReactNode;
  label: string;
};

function isMetadataItem(
  item: EbayListingMetadataItem | null,
): item is EbayListingMetadataItem {
  return Boolean(item);
}

function EbayResultCard({ result, index, isActive }: EbayResultCardProps) {
  const title = getField(result, "title") ?? "eBay listing";
  const url = getField(result, "url");
  const endedAt = getField(result, "endedAt");
  const condition = getField(result, "condition");
  const location = getField(result, "itemLocation");
  const acceptsOffers = isTrue(getField(result, "acceptsOffers"));
  const price = formatPrice(
    getField(result, isActive ? "currentPrice" : "soldPrice"),
    getField(result, isActive ? "currentCurrency" : "soldCurrency"),
  );
  const hasListingUrl = Boolean(url && /^https?:\/\//i.test(url));
  const metadataCandidates: (EbayListingMetadataItem | null)[] = [
    !isActive
      ? {
          icon: <CalendarDays aria-hidden="true" />,
          label: `Sold ${formatDate(endedAt)}`,
        }
      : null,
    isActive && location ? { label: location } : null,
    condition ? { label: condition } : null,
    !isActive && location ? { label: location } : null,
    isActive && acceptsOffers ? { label: "Accepts offers" } : null,
  ];
  const metadataItems = metadataCandidates.filter(isMetadataItem);

  return (
    <article
      key={url ?? `${title}-${index}`}
      className="ebay-sold-view__result card-hover"
      onClick={() => {
        if (hasListingUrl) window.open(url, "_blank", "noopener,noreferrer");
      }}
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
            <div className="ebay-sold-view__listing-meta">
              {metadataItems.map((item, itemIndex) => (
                <span
                  className="ebay-sold-view__sold-date"
                  key={`${item.label}-${itemIndex}`}
                >
                  {itemIndex > 0 && <span>{"\u2022"}</span>}
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="ebay-sold-view__price">
            <div className="ebay-sold-view__price-row">
              <strong>{price}</strong>
            </div>
            {hasListingUrl && (
              <a
                className="app-link ebay-sold-view__sale-link"
                href={url}
                onClick={(event) => event.stopPropagation()}
                target="_blank"
                rel="noreferrer"
              >
                {isActive ? "Buy" : "View sale"}{" "}
                <ExternalLink aria-hidden="true" />
              </a>
            )}
          </div>
        </header>
      </div>
    </article>
  );
}

function getGradingSearchText(result: EbayCompResult) {
  const searchableFields = result.fields
    .filter((field) =>
      /title|condition|grade|grading|grader|certification/i.test(field.key),
    )
    .map((field) => field.value);
  const searchableText = searchableFields
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const compactText = searchableText.replace(/\s/g, "");

  return { compactText, searchableText };
}

function normalizeFilterText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesTextFilter(result: EbayCompResult, query: string) {
  const normalizedQuery = normalizeFilterText(query);
  if (normalizedQuery.length < 2) return true;

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = normalizeFilterText(
    result.fields.map((field) => field.value).join(" "),
  );
  return terms.every((term) => searchableText.includes(term));
}

function isRawListing(result: EbayCompResult) {
  const { searchableText } = getGradingSearchText(result);

  if (/\b(?:raw|ungraded|not graded)\b/.test(searchableText)) {
    return true;
  }

  return !(
    /\b(?:psa|bgs|cgc|sgc)(?:\b|\d)/.test(searchableText) ||
    /\b(?:beckett|grade|graded|grading|slab|slabbed|encased|certified|certification)\b/.test(
      searchableText,
    )
  );
}

function matchesGrade(
  result: EbayCompResult,
  grade: Exclude<GradeFilter, "all" | "raw">,
) {
  const { compactText, searchableText } = getGradingSearchText(result);

  // Handles PSA 10, BGS-10, CGC Gem Mint 10, SGC10, Beckett 9, and
  // equivalent compact forms.
  const grader =
    "(?:psa|bgs|cgc|sgc|beckett|professional sports authenticator|certified guaranty company|sportscard guaranty corporation)";
  const compactGrader =
    "(?:psa|bgs|cgc|sgc|beckett|professionalsportsauthenticator|certifiedguarantycompany|sportscardguarantycorporation)";
  if (
    new RegExp(`${compactGrader}[a-z]{0,30}${grade}(?!\\d)`).test(
      compactText,
    ) ||
    new RegExp(`(?:^|\\s)${grade}\\s*${grader}(?:$|\\s)`).test(searchableText)
  ) {
    return true;
  }

  const hasGradeNumber = new RegExp(`(?:^|\\s)${grade}(?:$|\\s)`).test(
    searchableText,
  );
  const hasDirectGradePhrase = new RegExp(
    `\\b(?:grade|graded|grading|slab|slabbed|encased|certified)\\s*${grade}\\b|\\b${grade}\\s*(?:grade|graded|slab|slabbed|encased|certified)\\b`,
  ).test(searchableText);

  if (!hasGradeNumber) {
    return false;
  }
  if (hasDirectGradePhrase) {
    return true;
  }

  switch (grade) {
    case "7":
      return (
        /\b(?:near mint|nm)\s*7\b|\b7\s*(?:near mint|nm)\b/.test(
          searchableText,
        ) && !/\b(?:near mint (?:mint|mt)|nm mt)\b/.test(searchableText)
      );
    case "8":
      return (
        /\b(?:near mint (?:mint|mt)|nm mt)\s*8\b|\b8\s*(?:near mint (?:mint|mt)|nm mt)\b/.test(
          searchableText,
        ) ||
        compactText.includes("nmmt8") ||
        compactText.includes("8nmmt")
      );
    case "9":
      return Boolean(
        searchableText.match(/\bmint\s*9\b|\b9\s*mint\b/) &&
        !/\b(?:gem|near) mint\s*9\b|\b9\s*(?:gem|near) mint\b/.test(
          searchableText,
        ),
      );
    case "10":
      return (
        /\bgem (?:mint|mt)\s*10\b|\b10\s*gem (?:mint|mt)\b/.test(
          searchableText,
        ) ||
        compactText.includes("gemmint10") ||
        compactText.includes("10gemmint") ||
        compactText.includes("gemmt10") ||
        compactText.includes("10gemmt")
      );
  }
}

export default function EbaySoldView({
  card,
  demoResponse,
  runToken,
  onSubscriptionChange,
  onLoadingChange,
  onReportAvailableChange,
}: EbaySoldViewProps) {
  const [response, setResponse] = useState<EbayCompsResponse>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortOrder, setSortOrder] = useState<EbaySortOrder>("date-desc");
  const [listingTypeFilter, setListingTypeFilter] =
    useState<ListingTypeFilter>("sold");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [appliedGradeFilter, setAppliedGradeFilter] =
    useState<GradeFilter>("all");
  const [textFilter, setTextFilter] = useState("");
  const [appliedTextFilter, setAppliedTextFilter] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [visibleResultCount, setVisibleResultCount] =
    useState(RESULTS_BATCH_SIZE);
  const filterTimerRef = useRef<number | undefined>(undefined);
  const { isCurrentRequest, startRequest } = useAbortableRequest();

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(
    () => () => {
      window.clearTimeout(filterTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (runToken <= 0) return;

    if (demoResponse) return;

    async function loadEbayListings() {
      const params = new URLSearchParams({ cardId: card.id });
      const signal = startRequest();

      setLoading(true);
      setError("");
      setResponse(null);
      onReportAvailableChange?.(false);
      setSortOrder("date-desc");
      setListingTypeFilter("sold");
      setGradeFilter("all");
      setAppliedGradeFilter("all");
      setTextFilter("");
      setAppliedTextFilter("");
      setFiltering(false);
      window.clearTimeout(filterTimerRef.current);
      setVisibleResultCount(RESULTS_BATCH_SIZE);

      try {
        const res = await authenticatedFetch(
          `${API_URL}/ebay?${params.toString()}`,
          {
            signal,
          },
        );
        const data = (await res.json()) as Partial<
          PaidFeatureResponse<EbayCompsResponse>
        > & {
          error?: string;
          fromDatabase?: boolean;
          message?: string;
        };

        if (!res.ok) {
          throw new Error(
            data?.error ?? data?.message ?? "Failed to fetch eBay listings",
          );
        }

        if (!data.subscription) {
          throw new Error(
            "The eBay response did not include subscription data",
          );
        }
        onSubscriptionChange?.(data.subscription);
        if (data.fromDatabase) {
          await waitForStoredResponse(signal);
        }
        if (!signal.aborted) {
          const responseData = data.data as EbayCompsResponse;
          setResponse(responseData);
          const hasCompleteResponse =
            responseData &&
            typeof responseData === "object" &&
            !Array.isArray(responseData) &&
            "sold" in responseData &&
            "active" in responseData &&
            Boolean(responseData.sold) &&
            Boolean(responseData.active);
          onReportAvailableChange?.(Boolean(hasCompleteResponse));
        }
      } catch (requestError) {
        if (isAbortError(requestError)) return;
        if (!signal.aborted) {
          setError(FEATURE_ERROR_MESSAGE);
          onReportAvailableChange?.(false);
        }
      } finally {
        if (isCurrentRequest(signal)) {
          setLoading(false);
        }
      }
    }

    loadEbayListings();
  }, [
    card.id,
    isCurrentRequest,
    onReportAvailableChange,
    onSubscriptionChange,
    runToken,
    demoResponse,
    startRequest,
  ]);

  if (runToken <= 0) {
    return null;
  }

  if (loading) {
    return <LoadingState>Loading eBay listings...</LoadingState>;
  }
  if (error)
    return <p className="card-view__page-error">{FEATURE_ERROR_MESSAGE}</p>;

  const responseData = (demoResponse ?? response) as
    | { sold?: EbayCompsResponse; active?: EbayCompsResponse }
    | EbayCompsResponse;
  const splitResponse =
    responseData &&
    typeof responseData === "object" &&
    !Array.isArray(responseData) &&
    ("sold" in responseData || "active" in responseData)
      ? (responseData as {
          sold?: EbayCompsResponse;
          active?: EbayCompsResponse;
        })
      : null;
  const selectedResponseUnavailable = Boolean(
    splitResponse && !splitResponse[listingTypeFilter],
  );
  const results = splitResponse
    ? getVisibleEbayCompResults(splitResponse[listingTypeFilter])
    : listingTypeFilter === "sold"
      ? getVisibleEbayCompResults(responseData)
      : [];

  const listingTypeResults = results.filter(
    (result) => getField(result, "listingType") === listingTypeFilter,
  );
  const gradeFilteredResults =
    appliedGradeFilter === "all"
      ? listingTypeResults
      : appliedGradeFilter === "raw"
        ? listingTypeResults.filter(isRawListing)
        : listingTypeResults.filter((result) =>
            matchesGrade(result, appliedGradeFilter),
          );
  const filteredResults = appliedTextFilter
    ? gradeFilteredResults.filter((result) =>
        matchesTextFilter(result, appliedTextFilter),
      )
    : gradeFilteredResults;
  const sortedResults = [...filteredResults].sort(
    (firstResult, secondResult) => {
      const sortingByDate =
        sortOrder === "date-desc" || sortOrder === "date-asc";
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
    },
  );
  const visibleResults = sortedResults.slice(0, visibleResultCount);
  const remainingResultCount = sortedResults.length - visibleResults.length;
  const nextBatchSize = Math.min(RESULTS_BATCH_SIZE, remainingResultCount);

  function handleSortChange(value: EbaySortOrder) {
    setSortOrder(value);
    setVisibleResultCount(RESULTS_BATCH_SIZE);
  }

  function scheduleFilterChange(nextGrade: GradeFilter, nextText: string) {
    setFiltering(true);
    setVisibleResultCount(RESULTS_BATCH_SIZE);
    window.clearTimeout(filterTimerRef.current);
    filterTimerRef.current = window.setTimeout(() => {
      setAppliedGradeFilter(nextGrade);
      setAppliedTextFilter(nextText);
      setFiltering(false);
    }, FILTER_TRANSITION_MS);
  }

  function handleGradeFilterChange(value: GradeFilter) {
    setGradeFilter(value);
    scheduleFilterChange(value, textFilter);
  }

  function handleTextFilterChange(value: string) {
    setTextFilter(value);
    const nextTextFilter = normalizeFilterText(value).length >= 2 ? value : "";
    if (
      nextTextFilter === appliedTextFilter &&
      gradeFilter === appliedGradeFilter
    ) {
      window.clearTimeout(filterTimerRef.current);
      setFiltering(false);
      return;
    }
    scheduleFilterChange(gradeFilter, nextTextFilter);
  }

  function handleListingTypeChange(value: ListingTypeFilter) {
    setListingTypeFilter(value);
    setVisibleResultCount(RESULTS_BATCH_SIZE);
  }

  return (
    <div className="ebay-sold-view default-container ui-render-fade">
      <div className="ebay-sold-view__surface">
        <SegmentedRadioGroup
          ariaLabel="eBay listing type"
          className="ebay-sold-view__listing-toggle"
          name="ebay-listing-type"
          onChange={handleListingTypeChange}
          options={[
            { label: "Sold", value: "sold" },
            { label: "Listed", value: "active" },
          ]}
          value={listingTypeFilter}
        />
        <div className="ebay-sold-view__filter-row">
          <div className="ebay-sold-view__filter-groups">
            <fieldset className="ebay-sold-view__filters radio-group">
              <legend>Grade</legend>
              <div>
                {GRADE_FILTERS.map((filter) => (
                  <label key={filter.value}>
                    <input
                      checked={gradeFilter === filter.value}
                      name="ebay-grade"
                      type="radio"
                      value={filter.value}
                      onChange={() => handleGradeFilterChange(filter.value)}
                    />
                    <span>{filter.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="ebay-sold-view__text-filter">
              <span>Filter</span>
              <div>
                <Search aria-hidden="true" />
                <input
                  aria-label="Filter eBay results"
                  onChange={(event) =>
                    handleTextFilterChange(event.currentTarget.value)
                  }
                  minLength={2}
                  placeholder="Keyword"
                  type="search"
                  value={textFilter}
                />
              </div>
            </label>
          </div>
          <label className="ebay-sold-view__sorting">
            <span>Sort by</span>
            <SelectDropdown
              ariaLabel="Sort eBay listings"
              compact
              options={EBAY_SORT_OPTIONS}
              value={sortOrder}
              onChange={handleSortChange}
            />
          </label>
        </div>
      </div>
      <div className="ebay-sold-view__results-region" aria-busy={filtering}>
        {filtering && (
          <div
            aria-label="Filtering eBay listings"
            className="ebay-sold-view__filter-overlay"
            role="status"
          >
            <span className="loading-state__spinner" aria-hidden="true" />
          </div>
        )}
        <>
          {selectedResponseUnavailable ? (
            <p className="ebay-sold-view__state">
              Could not fetch eBay{" "}
              {listingTypeFilter === "sold" ? "sales" : "listings"}.
            </p>
          ) : visibleResults.length === 0 ? (
            <p className="ebay-sold-view__state">
              No matching eBay{" "}
              {listingTypeFilter === "sold" ? "sales" : "listings"} found.
            </p>
          ) : null}
          <div
            className="ebay-sold-view__results ui-render-fade"
            key={`${listingTypeFilter}-${appliedGradeFilter}-${appliedTextFilter}-${sortOrder}`}
          >
            {visibleResults.map((result, index) => (
              <EbayResultCard
                key={
                  getField(result, "url") ??
                  `${getField(result, "title")}-${index}`
                }
                index={index}
                isActive={getField(result, "listingType") === "active"}
                result={result}
              />
            ))}
          </div>
          {remainingResultCount > 0 && (
            <div className="ebay-sold-view__load-more">
              <button
                className="ebay-sold-view__load-more-button"
                type="button"
                onClick={() => {
                  setVisibleResultCount((count) => count + RESULTS_BATCH_SIZE);
                }}
              >
                Show {nextBatchSize} more
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      </div>
    </div>
  );
}
