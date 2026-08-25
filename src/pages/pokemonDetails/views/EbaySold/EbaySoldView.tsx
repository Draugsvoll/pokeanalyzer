import { useEffect, useMemo, useRef, useState } from "react";
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
import { CalendarDays, ChevronDown, ExternalLink, Gavel } from "lucide-react";
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
import { getFirstTcgPlayerMarketEntry } from "../../../../utils/pokemonPricing";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const RESULTS_BATCH_SIZE = 25;
const FILTER_TRANSITION_MS = 250;

type EbaySoldViewProps = {
  card: PokemonCard;
  runToken: number;
  onSubscriptionChange?: (subscription: UserSubscription) => void;
  onLoadingChange?: (loading: boolean) => void;
  onReportAvailableChange?: (available: boolean) => void;
};

type EbaySortOrder =
  "default" | "price-asc" | "price-desc" | "date-desc" | "date-asc";
type ListingTypeFilter = "sold" | "active";
type GradeFilter = "all" | "raw" | "7" | "8" | "9" | "10";
type ListingVariantFilter = {
  id: string;
  label: string;
  kind:
    | "normal"
    | "holo"
    | "reverse-holo"
    | "first-edition"
    | "first-edition-holo"
    | "other";
  aliases: string[];
};

const EBAY_SORT_OPTIONS: { value: EbaySortOrder; label: string }[] = [
  { value: "default", label: "—" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "date-desc", label: "Newest" },
  { value: "date-asc", label: "Oldest" },
];
const GRADE_FILTERS: { value: GradeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "raw", label: "Raw" },
  { value: "7", label: "PSA 7" },
  { value: "8", label: "PSA 8" },
  { value: "9", label: "PSA 9" },
  { value: "10", label: "PSA 10" },
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
                className="ebay-sold-view__sale-link"
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

function hasUsablePrice(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).some(hasUsablePrice);
}

function getAvailableVariantFilters(card: PokemonCard): ListingVariantFilter[] {
  const availableKeys = new Set<string>();

  for (const [key, value] of Object.entries(card.tcgplayer?.prices ?? {})) {
    if (hasUsablePrice(value))
      availableKeys.add(key.toLocaleLowerCase("en-US"));
  }
  if (
    Object.entries(card.cardmarket?.prices ?? {}).some(
      ([key, value]) =>
        key.toLocaleLowerCase("en-US").startsWith("reverseholo") &&
        hasUsablePrice(value),
    )
  ) {
    availableKeys.add("reverseholofoil");
  }

  const variants: ListingVariantFilter[] = [];
  const add = (variant: ListingVariantFilter) => {
    if (!variants.some((item) => item.id === variant.id))
      variants.push(variant);
  };

  for (const key of availableKeys) {
    if (key.includes("firstedition") && key.includes("holo")) {
      add({
        id: "first-edition-holo",
        label: "1st Ed. Holo",
        kind: "first-edition-holo",
        aliases: ["1st edition holo", "first edition holo", "1st ed holo"],
      });
    } else if (key.includes("firstedition")) {
      add({
        id: "first-edition",
        label: "1st Edition",
        kind: "first-edition",
        aliases: ["1st edition", "first edition", "1st ed"],
      });
    } else if (key.includes("reverse") && key.includes("holo")) {
      add({
        id: "reverse-holo",
        label: "Reverse Holo",
        kind: "reverse-holo",
        aliases: [
          "reverse holo",
          "reverse holofoil",
          "reverse foil",
          "rev holo",
          "rev foil",
          "rh",
        ],
      });
    } else if (key.includes("holo")) {
      add({
        id: "holo",
        label: "Holofoil",
        kind: "holo",
        aliases: ["holo", "holofoil", "holo foil"],
      });
    } else if (key === "normal") {
      add({
        id: "normal",
        label: "Normal",
        kind: "normal",
        aliases: ["normal", "non holo", "non holofoil", "regular", "standard"],
      });
    }
  }

  return variants;
}

function getDefaultListingVariantId(card: PokemonCard): string | null {
  const variant = getFirstTcgPlayerMarketEntry(
    card.tcgplayer?.prices,
  )?.variant.toLocaleLowerCase("en-US");

  if (!variant) return null;
  if (variant.includes("firstedition") && variant.includes("holo")) {
    return "first-edition-holo";
  }
  if (variant.includes("firstedition")) return "first-edition";
  if (variant.includes("reverse") && variant.includes("holo")) {
    return "reverse-holo";
  }
  if (variant.includes("holo")) return "holo";
  if (variant === "normal") return "normal";
  return null;
}

function getVariantSearchText(result: EbayCompResult) {
  return result.fields
    .filter((field) =>
      /title|condition|finish|foil|printing|variant|edition/i.test(field.key),
    )
    .map((field) => field.value)
    .join(" ")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsVariantAlias(text: string, alias: string) {
  const pattern = alias
    .toLocaleLowerCase("en-US")
    .trim()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("\\s*");
  return (
    Boolean(pattern) && new RegExp(`(?:^|\\s)${pattern}(?:$|\\s)`).test(text)
  );
}

function matchesListingVariant(
  result: EbayCompResult,
  variant: ListingVariantFilter,
  defaultVariantId: string | null,
) {
  const text = getVariantSearchText(result);
  const hasReverseHolo = [
    "reverse holo",
    "reverse holofoil",
    "reverse foil",
    "rev holo",
    "rev foil",
    "rh",
  ].some((alias) => containsVariantAlias(text, alias));
  const hasFirstEdition = ["1st edition", "first edition", "1st ed"].some(
    (alias) => containsVariantAlias(text, alias),
  );
  const hasHolo = ["holo", "holofoil", "holo foil"].some((alias) =>
    containsVariantAlias(text, alias),
  );
  const hasNormal = [
    "normal",
    "non holo",
    "non holofoil",
    "regular",
    "standard",
  ].some((alias) => containsVariantAlias(text, alias));
  const hasExplicitVariant =
    hasReverseHolo || hasFirstEdition || hasHolo || hasNormal;

  if (!hasExplicitVariant && variant.id === defaultVariantId) {
    return true;
  }

  if (variant.kind === "holo") {
    return hasHolo && !hasReverseHolo && !hasFirstEdition;
  }
  if (variant.kind === "first-edition") {
    return hasFirstEdition && !hasHolo && !hasReverseHolo;
  }
  if (variant.kind === "first-edition-holo") {
    return hasFirstEdition && hasHolo && !hasReverseHolo;
  }
  if (variant.kind === "normal") {
    return hasNormal;
  }

  return variant.aliases.some((alias) => containsVariantAlias(text, alias));
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
  runToken,
  onSubscriptionChange,
  onLoadingChange,
  onReportAvailableChange,
}: EbaySoldViewProps) {
  const [response, setResponse] = useState<EbayCompsResponse>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortOrder, setSortOrder] = useState<EbaySortOrder>("default");
  const [listingTypeFilter, setListingTypeFilter] =
    useState<ListingTypeFilter>("sold");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [appliedGradeFilter, setAppliedGradeFilter] =
    useState<GradeFilter>("all");
  const [variantFilter, setVariantFilter] = useState("all");
  const [appliedVariantFilter, setAppliedVariantFilter] = useState("all");
  const [filtering, setFiltering] = useState(false);
  const [visibleResultCount, setVisibleResultCount] =
    useState(RESULTS_BATCH_SIZE);
  const filterTimerRef = useRef<number | undefined>(undefined);
  const { isCurrentRequest, startRequest } = useAbortableRequest();
  const availableVariantFilters = useMemo(
    () => getAvailableVariantFilters(card),
    [card],
  );
  const defaultVariantFilterId = useMemo(
    () => getDefaultListingVariantId(card),
    [card],
  );

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

    async function loadEbayListings() {
      const params = new URLSearchParams({ cardId: card.id });
      const signal = startRequest();

      setLoading(true);
      setError("");
      setResponse(null);
      onReportAvailableChange?.(false);
      setSortOrder("default");
      setListingTypeFilter("sold");
      setGradeFilter("all");
      setAppliedGradeFilter("all");
      setVariantFilter("all");
      setAppliedVariantFilter("all");
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

  const responseData = response as
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
  const selectedVariant = availableVariantFilters.find(
    (variant) => variant.id === appliedVariantFilter,
  );
  const filteredResults = selectedVariant
    ? gradeFilteredResults.filter((result) =>
        matchesListingVariant(result, selectedVariant, defaultVariantFilterId),
      )
    : gradeFilteredResults;
  const sortedResults =
    sortOrder === "default"
      ? filteredResults
      : [...filteredResults].sort((firstResult, secondResult) => {
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
        });
  const visibleResults = sortedResults.slice(0, visibleResultCount);
  const remainingResultCount = sortedResults.length - visibleResults.length;
  const nextBatchSize = Math.min(RESULTS_BATCH_SIZE, remainingResultCount);

  function handleSortChange(value: EbaySortOrder) {
    setSortOrder(value);
    setVisibleResultCount(RESULTS_BATCH_SIZE);
  }

  function scheduleFilterChange(nextGrade: GradeFilter, nextVariant: string) {
    setFiltering(true);
    setVisibleResultCount(RESULTS_BATCH_SIZE);
    window.clearTimeout(filterTimerRef.current);
    filterTimerRef.current = window.setTimeout(() => {
      setAppliedGradeFilter(nextGrade);
      setAppliedVariantFilter(nextVariant);
      setFiltering(false);
    }, FILTER_TRANSITION_MS);
  }

  function handleGradeFilterChange(value: GradeFilter) {
    setGradeFilter(value);
    scheduleFilterChange(value, variantFilter);
  }

  function handleVariantFilterChange(value: string) {
    setVariantFilter(value);
    scheduleFilterChange(gradeFilter, value);
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
            { label: "Listings", value: "active" },
          ]}
          value={listingTypeFilter}
        />
        <div className="ebay-sold-view__filter-row">
          <div className="ebay-sold-view__filter-groups">
            <fieldset className="ebay-sold-view__filters feature-variant-radio-group">
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
            {availableVariantFilters.length > 1 && (
              <fieldset className="ebay-sold-view__filters feature-variant-radio-group">
                <legend>Variant</legend>
                <div>
                  <label>
                    <input
                      checked={variantFilter === "all"}
                      name="ebay-card-variant"
                      type="radio"
                      value="all"
                      onChange={() => handleVariantFilterChange("all")}
                    />
                    <span>All</span>
                  </label>
                  {availableVariantFilters.map((variant) => (
                    <label key={variant.id}>
                      <input
                        checked={variantFilter === variant.id}
                        name="ebay-card-variant"
                        type="radio"
                        value={variant.id}
                        onChange={() => handleVariantFilterChange(variant.id)}
                      />
                      <span>{variant.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
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
            key={`${listingTypeFilter}-${appliedGradeFilter}-${appliedVariantFilter}-${sortOrder}`}
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
