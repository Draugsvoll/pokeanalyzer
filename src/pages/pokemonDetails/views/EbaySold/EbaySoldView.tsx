import { InfoTooltip } from "../../../../components/ui/InfoTooltip";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import {
  getVisibleEbayCompResults,
  type EbayCompsResponse,
  type EbayCompResult,
} from "../../../../utils/ebayComps";
import {
  ChevronDown,
  Columns2,
  ExternalLink,
  Eye,
  Gavel,
  Rows2,
} from "lucide-react";
import "./EbaySoldView.scss";
import { ClearFiltersButton } from "../../../../components/clearFiltersButton/ClearFiltersButton";
import { FilterInput } from "../../../../components/filterInput/FilterInput";
import { RadioButtonGroup } from "../../../../components/radioButtonGroup/RadioButtonGroup";
import { SelectDropdown } from "../../../../components/selectDropdown/SelectDropdown";
import { SegmentedRadioGroup } from "../../../../components/ui/SegmentedRadioGroup";
import { EbayImagePreview } from "./EbayImagePreview";
import type {
  EbayListingStatus,
  EbayListingType,
} from "../../../../../shared/ebaySearch";

const RESULTS_BATCH_SIZE = 15;
const FILTER_TRANSITION_MS = 250;
const DUAL_VIEW_BREAKPOINT = "(min-width: 1100px)";

type EbaySoldViewProps = {
  response: EbayCompsResponse;
  children?: ReactNode;
  initialListingType?: EbayListingType;
  listingStates?: Record<EbayListingType, EbayListingStatus>;
};

type EbaySortOrder = "price-asc" | "price-desc" | "date-desc" | "date-asc";
type ListingTypeFilter = "sold" | "active";
type ResultViewMode = "basic" | "advanced";
type GradeFilter = "all" | "6" | "7" | "8" | "9" | "10";
type GraderFilter = "all" | "psa" | "cgc" | "bgs" | "sgc" | "tag";

const EBAY_SORT_OPTIONS: { value: EbaySortOrder; label: string }[] = [
  { value: "price-desc", label: "Price \u2193" },
  { value: "price-asc", label: "Price \u2191" },
  { value: "date-desc", label: "Newest" },
  { value: "date-asc", label: "Oldest" },
];
const GRADE_FILTERS: { value: GradeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "6", label: "Grade 6" },
  { value: "7", label: "Grade 7" },
  { value: "8", label: "Grade 8" },
  { value: "9", label: "Grade 9" },
  { value: "10", label: "Grade 10" },
];
const GRADER_FILTERS: { value: GraderFilter; label: string }[] = [
  { value: "all", label: "All companies" },
  { value: "psa", label: "PSA" },
  { value: "cgc", label: "CGC" },
  { value: "bgs", label: "Beckett / BGS" },
  { value: "sgc", label: "SGC" },
  { value: "tag", label: "TAG" },
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

function getPriceSummary(
  results: EbayCompResult[],
  listingType: ListingTypeFilter,
) {
  const priceKey = listingType === "sold" ? "soldPrice" : "currentPrice";
  const currencyKey =
    listingType === "sold" ? "soldCurrency" : "currentCurrency";
  const pricesByCurrency = new Map<string, number[]>();

  for (const result of results) {
    const rawPrice = getField(result, priceKey);
    if (!rawPrice) continue;

    const price = Number(rawPrice.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(price) || price <= 0) continue;

    const currency = getField(result, currencyKey)?.toUpperCase() ?? "";
    const prices = pricesByCurrency.get(currency) ?? [];
    prices.push(price);
    pricesByCurrency.set(currency, prices);
  }

  const dominantCurrency = [...pricesByCurrency.entries()].sort(
    (first, second) => second[1].length - first[1].length,
  )[0];
  if (!dominantCurrency) return null;

  const [currency, prices] = dominantCurrency;
  prices.sort((first, second) => first - second);
  const middleIndex = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[middleIndex - 1] + prices[middleIndex]) / 2
      : prices[middleIndex];
  const format = (price: number) =>
    formatPrice(String(price), currency || undefined);

  return {
    high: format(prices[prices.length - 1]),
    low: format(prices[0]),
    median: format(median),
  };
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

function formatBidCount(value?: string) {
  if (!value) return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) return null;
  return `${count} ${count === 1 ? "bid" : "bids"}`;
}

function formatCount(
  value: string | undefined,
  singular: string,
  plural: string,
) {
  if (!value) return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatShipping(
  shippingType: string | undefined,
  shippingPrice: string | null,
) {
  if (shippingType?.trim().toLowerCase() === "free") return "Free shipping";
  return shippingPrice ? `${shippingPrice} shipping` : null;
}

type EbayResultCardProps = {
  result: EbayCompResult;
  gradeFilter: GradeFilter;
  graderFilter: GraderFilter;
  isActive: boolean;
  includeQuery: string;
  expansion: { expanded: boolean };
};

type EbayListingMetadataItem = {
  label: string;
  icon?: ReactNode;
};

function isMetadataItem(
  item: EbayListingMetadataItem | null,
): item is EbayListingMetadataItem {
  return Boolean(item);
}

function useDualViewAvailable() {
  const [available, setAvailable] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(DUAL_VIEW_BREAKPOINT).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(DUAL_VIEW_BREAKPOINT);
    const updateAvailability = () => setAvailable(mediaQuery.matches);

    updateAvailability();
    mediaQuery.addEventListener("change", updateAvailability);
    return () => mediaQuery.removeEventListener("change", updateAvailability);
  }, []);

  return available;
}

function EbayResultCard({
  result,
  gradeFilter,
  graderFilter,
  isActive,
  includeQuery,
  expansion,
}: EbayResultCardProps) {
  const title = getField(result, "title") ?? "Ebay listing";
  const titleRef = useRef<HTMLHeadingElement>(null);
  const metadataRef = useRef<HTMLDivElement>(null);
  const [localExpansion, setLocalExpansion] = useState({
    command: expansion,
    expanded: expansion.expanded,
  });
  const titleExpanded =
    localExpansion.command === expansion
      ? localExpansion.expanded
      : expansion.expanded;
  const [titleOverflowing, setTitleOverflowing] = useState(false);
  const [metadataOverflowing, setMetadataOverflowing] = useState(false);
  const url = getField(result, "url");
  const endedAt = getField(result, "endedAt");
  const condition = getField(result, "condition");
  const location = getField(result, "itemLocation");
  const acceptsOffers = isTrue(getField(result, "acceptsOffers"));
  const offerAccepted = isTrue(getField(result, "bestOfferAccepted"));
  const bidCount = formatBidCount(getField(result, "bidCount"));
  const timeLeft = getField(result, "timeLeft");
  const watchers = formatCount(
    getField(result, "watcherCount"),
    "watching",
    "watching",
  );
  const buyItNowValue = getField(result, "buyItNowPrice");
  const buyItNowPrice = buyItNowValue
    ? formatPrice(
        buyItNowValue,
        getField(result, isActive ? "currentCurrency" : "soldCurrency"),
      )
    : null;
  const price = formatPrice(
    getField(result, isActive ? "currentPrice" : "soldPrice"),
    getField(result, isActive ? "currentCurrency" : "soldCurrency"),
  );
  const shippingPrice = result.shippingPrice
    ? formatPrice(result.shippingPrice, result.shippingCurrency ?? undefined)
    : null;
  const shippingLabel = formatShipping(
    getField(result, "shippingType"),
    shippingPrice,
  );
  const hasListingUrl = Boolean(url && /^https?:\/\//i.test(url));
  const metadataCandidates: (EbayListingMetadataItem | null)[] = [
    !isActive
      ? {
          label: formatDate(endedAt),
        }
      : null,
    isActive && location ? { label: location } : null,
    condition && !/^(?:new\s*\(other\)|pre[-\s]owned)$/i.test(condition.trim())
      ? { label: condition }
      : null,
    bidCount ? { label: bidCount } : null,
    !isActive && location ? { label: location } : null,
    isActive && acceptsOffers ? { label: "Accepts offers" } : null,
    offerAccepted ? { label: "Offer accepted" } : null,
    timeLeft ? { label: `${timeLeft} left` } : null,
    buyItNowPrice ? { label: `Buy It Now ${buyItNowPrice}` } : null,
    watchers ? { label: watchers, icon: <Eye aria-hidden="true" /> } : null,
    isActive && shippingLabel ? { label: shippingLabel } : null,
  ];
  const metadataItems = metadataCandidates.filter(isMetadataItem);

  useLayoutEffect(() => {
    const titleElement = titleRef.current;
    const metadataElement = metadataRef.current;
    if (!titleElement || titleExpanded) return;

    const updateOverflow = () => {
      setTitleOverflowing(
        titleElement.scrollWidth > titleElement.clientWidth + 1,
      );
      if (metadataElement) {
        setMetadataOverflowing(
          metadataElement.scrollWidth > metadataElement.clientWidth + 1,
        );
      }
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateOverflow);
    let mounted = true;
    const animationFrame = window.requestAnimationFrame(updateOverflow);

    updateOverflow();
    resizeObserver?.observe(titleElement);
    if (metadataElement) resizeObserver?.observe(metadataElement);
    window.addEventListener("resize", updateOverflow);
    void document.fonts?.ready.then(() => {
      if (mounted) updateOverflow();
    });
    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [metadataItems.length, title, titleExpanded]);

  return (
    <article
      className={`ebay-sold-view__result${titleExpanded ? " ebay-sold-view__result--expanded" : ""}`}
    >
      <div className="ebay-sold-view__visual">
        {result.thumbnailUrl ? (
          <EbayImagePreview
            src={result.thumbnailUrl}
            previewSrc={result.fullResThumbnailUrl ?? undefined}
            title={title}
          />
        ) : (
          <div className="ebay-sold-view__media">
            <Gavel aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="ebay-sold-view__content">
        <header className="ebay-sold-view__header">
          <div
            className={`ebay-sold-view__title-block${titleOverflowing || metadataOverflowing ? " ebay-sold-view__title-block--toggleable" : ""}${titleExpanded ? " ebay-sold-view__title-block--expanded" : ""}`}
          >
            <h3 ref={titleRef}>
              {highlightHeadline(
                title,
                includeQuery,
                gradeFilter,
                graderFilter,
              )}
            </h3>
            <div className="ebay-sold-view__listing-meta" ref={metadataRef}>
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
            {(titleOverflowing || metadataOverflowing) && (
              <button
                aria-expanded={titleExpanded}
                aria-label={`${titleExpanded ? "Collapse" : "Expand"} listing title`}
                className="ebay-sold-view__title-toggle"
                onClick={() =>
                  setLocalExpansion({
                    command: expansion,
                    expanded: !titleExpanded,
                  })
                }
                type="button"
              >
                <ChevronDown aria-hidden="true" />
              </button>
            )}
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
    // Preserve half grades and normalize whole decimal grades before
    // punctuation is removed.
    .replace(/(\d)\s*\.\s*5\b/g, "$1half")
    .replace(/(\d)\s*\.\s*0\b/g, "$1")
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

function getFilterKeywords(query: string) {
  return query
    .split(",")
    .map(normalizeFilterText)
    .filter((keyword) => keyword.length >= 2);
}

function getGradeHighlightPattern(grade: Exclude<GradeFilter, "all">) {
  const gradeNumber = String.raw`${grade}(?:\s*\.\s*(?:0|5))?`;
  const grader =
    "psa|bgs|beckett|cgc|sgc|professional sports authenticator|certified guaranty company|sportscard guaranty corporation";
  const gradeWord = "grade|graded|grading|slab|slabbed|encased|certified";
  const condition =
    grade === "10"
      ? String.raw`gem(?:\s+|-)(?:mint|mt)`
      : grade === "9"
        ? String.raw`(?<!gem(?:\s+|-)|near(?:\s+|-))mint`
        : grade === "8"
          ? String.raw`(?:near(?:\s+|-)mint(?:\s+|-)?(?:mint|mt)|nm(?:\s+|-)?mt)`
          : grade === "7"
            ? String.raw`(?:near(?:\s+|-)mint|nm)`
            : String.raw`(?:excellent(?:\s+|-)mint|ex(?:\s+|-)(?:mint|mt))`;
  const tagGrade = String.raw`\btag(?:[\s-]+(?:grading|pristine))?[\s-]*${gradeNumber}\b`;
  const tagPristine = grade === "10" ? String.raw`|\btag[\s-]+pristine\b` : "";

  return String.raw`${tagGrade}${tagPristine}|\b(?:${grader})(?:[\s-]+[a-z]+){0,4}[\s-]*${gradeNumber}\b|\b${gradeNumber}[\s-]*(?:${grader})\b|\b(?:${gradeWord})[\s-]*${gradeNumber}\b|\b${gradeNumber}[\s-]*(?:${gradeWord})\b|\b(?:${condition})[\s-]*${gradeNumber}\b|\b${gradeNumber}[\s-]*(?:${condition})\b`;
}

function getGraderHighlightPattern(grader: Exclude<GraderFilter, "all">) {
  switch (grader) {
    case "psa":
      return String.raw`\bprofessional[\s-]+sports[\s-]+authenticator\b|\bpsa(?=\b|\d)`;
    case "cgc":
      return String.raw`\bcertified[\s-]+guaranty[\s-]+company\b|\bcgc(?=\b|\d)`;
    case "bgs":
      return String.raw`\bbeckett\b|\bbgs(?=\b|\d)`;
    case "sgc":
      return String.raw`\bsportscard[\s-]+guaranty[\s-]+corporation\b|\bsgc(?=\b|\d)`;
    case "tag":
      return String.raw`\btag(?=(?:[\s-]+(?:grading|pristine)|[\s-]*(?:10|[1-9])(?:\s*\.\s*5)?\b))`;
  }
}

function highlightHeadline(
  title: string,
  query: string,
  grade: GradeFilter = "all",
  grader: GraderFilter = "all",
) {
  const headline = formatHeadline(title);
  const keywords = getFilterKeywords(query);
  const keywordPattern = keywords
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const gradePattern = grade === "all" ? "" : getGradeHighlightPattern(grade);
  const graderPattern =
    grader === "all" ? "" : getGraderHighlightPattern(grader);
  const pattern = [keywordPattern, gradePattern, graderPattern]
    .filter(Boolean)
    .join("|");
  if (!pattern) return headline;

  const parts = headline.split(new RegExp(`(${pattern})`, "i"));
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark className="ebay-sold-view__keyword-mark" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function matchesTextFilter(result: EbayCompResult, query: string) {
  const keywords = getFilterKeywords(query);
  if (keywords.length === 0) return true;
  const searchableText = normalizeFilterText(
    result.fields.map((field) => field.value).join(" "),
  );
  return keywords.every((keyword) => searchableText.includes(keyword));
}

function matchesAnyTextFilter(result: EbayCompResult, query: string) {
  const keywords = getFilterKeywords(query);
  if (keywords.length === 0) return false;
  const searchableText = normalizeFilterText(
    result.fields.map((field) => field.value).join(" "),
  );
  return keywords.some((keyword) => searchableText.includes(keyword));
}

function matchesTagGrader(result: EbayCompResult) {
  const { searchableText } = getGradingSearchText(result);

  return /\btag(?:\s+(?:grading|pristine)(?:\s*(?:10|[1-9](?:half)?))?|\s*(?:10|[1-9](?:half)?))\b/.test(
    searchableText,
  );
}

function matchesGrader(
  result: EbayCompResult,
  grader: Exclude<GraderFilter, "all">,
) {
  const { searchableText } = getGradingSearchText(result);

  switch (grader) {
    case "psa":
      return /\bpsa(?:\b|\d)|\bprofessional sports authenticator\b/.test(
        searchableText,
      );
    case "cgc":
      return /\bcgc(?:\b|\d)|\bcertified guaranty company\b/.test(
        searchableText,
      );
    case "bgs":
      return /\bbgs(?:\b|\d)|\bbeckett\b/.test(searchableText);
    case "sgc":
      return /\bsgc(?:\b|\d)|\bsportscard guaranty corporation\b/.test(
        searchableText,
      );
    case "tag":
      return matchesTagGrader(result);
  }
}

function matchesGrade(
  result: EbayCompResult,
  grade: Exclude<GradeFilter, "all">,
) {
  const { compactText, searchableText } = getGradingSearchText(result);
  // 8.5 is preserved as 8half, so a whole-grade filter includes its half grade.
  const gradeToken = `(?:${grade}|${grade}half)`;
  const tagGradePattern = new RegExp(
    `\\btag(?:\\s+(?:grading|pristine))?\\s*${gradeToken}(?:$|\\s)`,
  );
  if (
    tagGradePattern.test(searchableText) ||
    (grade === "10" && /\btag\s+pristine(?:$|\s)/.test(searchableText))
  ) {
    return true;
  }

  // Handles PSA 10, BGS-10, CGC Gem Mint 10, SGC10, Beckett 9, and
  // equivalent compact forms.
  const grader =
    "(?:psa|bgs|cgc|sgc|beckett|professional sports authenticator|certified guaranty company|sportscard guaranty corporation)";
  const compactGrader =
    "(?:psa|bgs|cgc|sgc|beckett|professionalsportsauthenticator|certifiedguarantycompany|sportscardguarantycorporation)";
  if (
    new RegExp(`${compactGrader}[a-z]{0,30}${gradeToken}(?!\\d)`).test(
      compactText,
    ) ||
    new RegExp(`(?:^|\\s)${gradeToken}\\s*${grader}(?:$|\\s)`).test(
      searchableText,
    )
  ) {
    return true;
  }

  const hasGradeNumber = new RegExp(`(?:^|\\s)${gradeToken}(?:$|\\s)`).test(
    searchableText,
  );
  const hasDirectGradePhrase = new RegExp(
    `\\b(?:grade|graded|grading|slab|slabbed|encased|certified)\\s*${gradeToken}\\b|\\b${gradeToken}\\s*(?:grade|graded|slab|slabbed|encased|certified)\\b`,
  ).test(searchableText);

  if (!hasGradeNumber) {
    return false;
  }
  if (hasDirectGradePhrase) {
    return true;
  }

  switch (grade) {
    case "6":
      return new RegExp(
        `\\b(?:excellent mint|ex mint|ex mt)\\s*${gradeToken}\\b|\\b${gradeToken}\\s*(?:excellent mint|ex mint|ex mt)\\b`,
      ).test(searchableText);
    case "7":
      return (
        new RegExp(
          `\\b(?:near mint|nm)\\s*${gradeToken}\\b|\\b${gradeToken}\\s*(?:near mint|nm)\\b`,
        ).test(searchableText) &&
        !/\b(?:near mint (?:mint|mt)|nm mt)\b/.test(searchableText)
      );
    case "8":
      return (
        new RegExp(
          `\\b(?:near mint (?:mint|mt)|nm mt)\\s*${gradeToken}\\b|\\b${gradeToken}\\s*(?:near mint (?:mint|mt)|nm mt)\\b`,
        ).test(searchableText) ||
        compactText.includes("nmmt8") ||
        compactText.includes("8nmmt") ||
        compactText.includes("nmmt8half") ||
        compactText.includes("8halfnmmt")
      );
    case "9":
      return Boolean(
        new RegExp(
          `\\bmint\\s*${gradeToken}\\b|\\b${gradeToken}\\s*mint\\b`,
        ).test(searchableText) &&
        !new RegExp(
          `\\b(?:gem|near) mint\\s*${gradeToken}\\b|\\b${gradeToken}\\s*(?:gem|near) mint\\b`,
        ).test(searchableText),
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
  response,
  children,
  initialListingType = "sold",
  listingStates,
}: EbaySoldViewProps) {
  const [sortOrder, setSortOrder] = useState<EbaySortOrder>("price-desc");
  const [listingTypeFilter, setListingTypeFilter] =
    useState<ListingTypeFilter>(initialListingType);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [appliedGradeFilter, setAppliedGradeFilter] =
    useState<GradeFilter>("all");
  const [graderFilter, setGraderFilter] = useState<GraderFilter>("all");
  const [appliedGraderFilter, setAppliedGraderFilter] =
    useState<GraderFilter>("all");
  const [textFilter, setTextFilter] = useState("");
  const [appliedTextFilter, setAppliedTextFilter] = useState("");
  const [excludeFilter, setExcludeFilter] = useState("");
  const [appliedExcludeFilter, setAppliedExcludeFilter] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [visibleResultCounts, setVisibleResultCounts] = useState<
    Record<ListingTypeFilter, number>
  >({ sold: RESULTS_BATCH_SIZE, active: RESULTS_BATCH_SIZE });
  const [expansion, setExpansion] = useState({ expanded: false });
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>("basic");
  const filterTimerRef = useRef<number | undefined>(undefined);
  const dualViewAvailable = useDualViewAvailable();

  useEffect(
    () => () => {
      window.clearTimeout(filterTimerRef.current);
    },
    [],
  );

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
  function getSortedResults(listingType: ListingTypeFilter) {
    const listingResponse = splitResponse
      ? splitResponse[listingType]
      : listingType === "sold"
        ? responseData
        : null;
    const listingTypeResults = getVisibleEbayCompResults(
      listingResponse,
    ).filter((result) => getField(result, "listingType") === listingType);
    const gradeFilteredResults =
      appliedGradeFilter === "all"
        ? listingTypeResults
        : listingTypeResults.filter((result) =>
            matchesGrade(result, appliedGradeFilter),
          );
    const graderFilteredResults =
      appliedGraderFilter === "all"
        ? gradeFilteredResults
        : gradeFilteredResults.filter((result) =>
            matchesGrader(result, appliedGraderFilter),
          );
    const filteredResults = graderFilteredResults.filter(
      (result) =>
        (!appliedTextFilter || matchesTextFilter(result, appliedTextFilter)) &&
        (!appliedExcludeFilter ||
          !matchesAnyTextFilter(result, appliedExcludeFilter)),
    );
    return [...filteredResults].sort((firstResult, secondResult) => {
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
  }

  const resultsByType = {
    sold: getSortedResults("sold"),
    active: getSortedResults("active"),
  };
  function resetVisibleResults() {
    setVisibleResultCounts({
      sold: RESULTS_BATCH_SIZE,
      active: RESULTS_BATCH_SIZE,
    });
  }

  function handleSortChange(value: EbaySortOrder) {
    setSortOrder(value);
    resetVisibleResults();
  }

  function scheduleFilterChange(
    nextGrade: GradeFilter,
    nextGrader: GraderFilter,
    text: string,
    exclude: string,
  ) {
    const nextText = getFilterKeywords(text).length > 0 ? text : "";
    const nextExclude = getFilterKeywords(exclude).length > 0 ? exclude : "";
    window.clearTimeout(filterTimerRef.current);
    if (
      nextGrade === appliedGradeFilter &&
      nextGrader === appliedGraderFilter &&
      nextText === appliedTextFilter &&
      nextExclude === appliedExcludeFilter
    ) {
      setFiltering(false);
      return;
    }
    resetVisibleResults();
    if (response == null) {
      setAppliedGradeFilter(nextGrade);
      setAppliedGraderFilter(nextGrader);
      setAppliedTextFilter(nextText);
      setAppliedExcludeFilter(nextExclude);
      setFiltering(false);
      return;
    }
    setFiltering(true);
    filterTimerRef.current = window.setTimeout(() => {
      setAppliedGradeFilter(nextGrade);
      setAppliedGraderFilter(nextGrader);
      setAppliedTextFilter(nextText);
      setAppliedExcludeFilter(nextExclude);
      setFiltering(false);
    }, FILTER_TRANSITION_MS);
  }

  function handleGradeFilterChange(value: GradeFilter) {
    setGradeFilter(value);
    scheduleFilterChange(value, graderFilter, textFilter, excludeFilter);
  }

  function handleGraderFilterChange(value: GraderFilter) {
    setGraderFilter(value);
    scheduleFilterChange(gradeFilter, value, textFilter, excludeFilter);
  }

  function handleTextFilterChange(value: string) {
    setTextFilter(value);
    scheduleFilterChange(gradeFilter, graderFilter, value, excludeFilter);
  }

  function handleExcludeFilterChange(value: string) {
    setExcludeFilter(value);
    scheduleFilterChange(gradeFilter, graderFilter, textFilter, value);
  }

  function clearFilters() {
    window.clearTimeout(filterTimerRef.current);
    setGradeFilter("all");
    setAppliedGradeFilter("all");
    setGraderFilter("all");
    setAppliedGraderFilter("all");
    setTextFilter("");
    setAppliedTextFilter("");
    setExcludeFilter("");
    setAppliedExcludeFilter("");
    setFiltering(false);
    resetVisibleResults();
  }

  function handleListingTypeChange(value: ListingTypeFilter) {
    setListingTypeFilter(value);
  }

  function loadMore(listingType: ListingTypeFilter) {
    setVisibleResultCounts((counts) => ({
      ...counts,
      [listingType]: counts[listingType] + RESULTS_BATCH_SIZE,
    }));
  }

  function handleResultScroll(
    event: UIEvent<HTMLDivElement>,
    listingType: ListingTypeFilter,
  ) {
    const element = event.currentTarget;
    if (
      element.scrollHeight - element.scrollTop - element.clientHeight < 96 &&
      visibleResultCounts[listingType] < resultsByType[listingType].length
    ) {
      loadMore(listingType);
    }
  }

  const advancedView = dualViewAvailable && resultViewMode === "advanced";
  const hasFilters =
    gradeFilter !== "all" ||
    graderFilter !== "all" ||
    textFilter.trim().length > 0 ||
    excludeFilter.trim().length > 0;
  const viewControls = (
    <div className="ebay-sold-view__view-controls">
      {hasFilters && (
        <ClearFiltersButton label="Clear filters" onClick={clearFilters} />
      )}
      <div className="ebay-sold-view__sorting">
        <RadioButtonGroup
          ariaLabel="Sort Ebay listings"
          options={EBAY_SORT_OPTIONS}
          value={sortOrder}
          onChange={handleSortChange}
        />
      </div>
      {dualViewAvailable && (
        <div className="ebay-sold-view__view-toggle-anchor">
          <RadioButtonGroup
            ariaLabel="Ebay results view"
            className="ebay-sold-view__view-toggle"
            onChange={setResultViewMode}
            options={[
              {
                label: (
                  <>
                    <Rows2 aria-hidden="true" />
                    Single
                  </>
                ),
                value: "basic",
              },
              {
                label: (
                  <>
                    <Columns2 aria-hidden="true" />
                    Dual
                  </>
                ),
                value: "advanced",
              },
            ]}
            value={resultViewMode}
          />
          {advancedView && (
            <button
              type="button"
              className="ebay-sold-view__expand-all"
              aria-label={`${expansion.expanded ? "Collapse" : "Expand"} all listings`}
              title={`${expansion.expanded ? "Collapse" : "Expand"} all listings`}
              aria-expanded={expansion.expanded}
              onClick={() => setExpansion({ expanded: !expansion.expanded })}
            >
              <span>{expansion.expanded ? "Collapse all" : "Expand all"}</span>
              <ChevronDown aria-hidden="true" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );

  function renderResultList(listingType: ListingTypeFilter) {
    const results = resultsByType[listingType];
    const visible = results.slice(0, visibleResultCounts[listingType]);
    const unavailable = Boolean(splitResponse && !splitResponse[listingType]);
    const loading = listingStates?.[listingType] === "pending";
    const label = listingType === "sold" ? "Sold" : "Listed";
    const priceSummary = getPriceSummary(results, listingType);

    return (
      <section
        className={`ebay-sold-view__result-panel${advancedView ? "" : " ebay-sold-view__result-panel--basic"}${loading ? " ebay-sold-view__result-panel--loading" : ""}`}
        aria-label={
          listingType === "sold" ? "Sold Ebay results" : "Listed Ebay results"
        }
      >
        <header className="ebay-sold-view__result-summary">
          <h2>
            <span
              role={!advancedView && !loading ? "status" : undefined}
              aria-busy={!advancedView && !loading ? filtering : undefined}
            >
              <span className="ebay-sold-view__summary-label">{label}</span>
              {!loading && (
                <>
                  {" \u00b7 "}
                  <span
                    className="ebay-sold-view__result-count ui-render-fade"
                    key={results.length}
                  >
                    {results.length}{" "}
                    {results.length === 1 ? "match" : "matches"}
                  </span>
                </>
              )}
            </span>
          </h2>
          {!loading && priceSummary && (
            <dl
              aria-label={`${label} price summary`}
              className="ebay-sold-view__price-summary"
            >
              <div>
                <dt>High</dt>
                <dd className="ui-render-fade" key={priceSummary.high}>
                  {priceSummary.high}
                </dd>
              </div>
              <div>
                <dt>Median</dt>
                <dd className="ui-render-fade" key={priceSummary.median}>
                  {priceSummary.median}
                </dd>
              </div>
              <div>
                <dt>Low</dt>
                <dd className="ui-render-fade" key={priceSummary.low}>
                  {priceSummary.low}
                </dd>
              </div>
            </dl>
          )}
        </header>
        {loading && (
          <div
            aria-label={`Loading ${label.toLowerCase()} Ebay results`}
            className="ebay-sold-view__state ebay-sold-view__state--loading"
            role="status"
          >
            <span aria-hidden="true" className="app-loading-spinner" />
          </div>
        )}
        {!loading && !unavailable && visible.length === 0 && (
          <p className="ebay-sold-view__state">
            No matching Ebay {listingType === "sold" ? "sales" : "listings"}{" "}
            found.
          </p>
        )}
        <div
          className="ebay-sold-view__results"
          key={`${listingType}-${appliedGradeFilter}-${appliedGraderFilter}-${appliedTextFilter}-${appliedExcludeFilter}-${sortOrder}`}
          onScroll={(event) => handleResultScroll(event, listingType)}
        >
          {visible.map((result, index) => (
            <EbayResultCard
              expansion={expansion}
              key={
                getField(result, "url") ??
                `${getField(result, "title")}-${index}`
              }
              gradeFilter={appliedGradeFilter}
              graderFilter={appliedGraderFilter}
              includeQuery={appliedTextFilter}
              isActive={listingType === "active"}
              result={result}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="ebay-sold-view ui-render-fade">
      <span className="feature-analysis-eyebrow ebay-sold-view__eyebrow">
        Sold &amp; active listings
      </span>
      <div className="ebay-sold-view__surface">
        <div className="ebay-sold-view__listing-selector">
          <SegmentedRadioGroup
            ariaLabel="Ebay listing type"
            className="ebay-sold-view__listing-toggle"
            name="ebay-listing-type"
            onChange={handleListingTypeChange}
            options={[
              {
                label: "Sold",
                value: "sold",
                loading: listingStates?.sold === "pending",
                disabled: listingStates && listingStates.sold !== "success",
              },
              {
                label: "Listed",
                value: "active",
                loading: listingStates?.active === "pending",
                disabled: listingStates && listingStates.active !== "success",
              },
            ]}
            value={listingTypeFilter}
          />
        </div>
        <div className="ebay-sold-view__filter-row">
          <div className="ebay-sold-view__grade-controls">
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
            <div
              className={`ebay-sold-view__grader-filter${graderFilter === "all" ? "" : " ebay-sold-view__grader-filter--active"}`}
            >
              <SelectDropdown
                ariaLabel="Filter by grading company"
                compact
                options={GRADER_FILTERS}
                value={graderFilter}
                onChange={handleGraderFilterChange}
              />
            </div>
          </div>
          {viewControls}
        </div>
        <div className="ebay-sold-view__filter-row">
          <div className="ebay-sold-view__control-group">
            <div className="ebay-sold-view__keyword-filter">
              <FilterInput
                ariaLabel="Exclude keywords"
                className="ebay-sold-view__text-filter"
                clearLabel="Clear excluded keywords"
                id="ebay-exclude-keywords"
                onChange={handleExcludeFilterChange}
                placeholder="Exclude keywords"
                value={excludeFilter}
              />
              {!excludeFilter.trim() && (
                <InfoTooltip
                  className="ebay-sold-view__filter-help"
                  label="How excluded keywords work"
                >
                  <strong>Keywords</strong>
                  <span>
                    Apply multiple keywords by separating with commas. Results
                    are excluded if it matches any of the words.
                  </span>

                  <span>"Reverse holo, anniversary, cgc"</span>
                </InfoTooltip>
              )}
            </div>
            <div className="ebay-sold-view__keyword-filter">
              <FilterInput
                ariaLabel="Include keywords"
                className="ebay-sold-view__text-filter"
                clearLabel="Clear included keywords"
                id="ebay-include-keywords"
                onChange={handleTextFilterChange}
                placeholder="Include keywords"
                value={textFilter}
              />
              {!textFilter.trim() && (
                <InfoTooltip
                  className="ebay-sold-view__filter-help"
                  label="How included keywords work"
                >
                  <strong>Keywords</strong>
                  <span>
                    Apply multiple keywords by separating with commas. Results
                    must match all words.
                  </span>

                  <span>"psa, 1st edition, secret rare"</span>
                </InfoTooltip>
              )}
            </div>
          </div>
        </div>
      </div>
      {children}
      {response != null && (
        <div className="ebay-sold-view__results-region" aria-busy={filtering}>
          <div
            className={`ebay-sold-view__result-panels${advancedView ? " ebay-sold-view__result-panels--advanced" : ""}`}
          >
            {advancedView ? (
              <>
                {renderResultList("sold")}
                {renderResultList("active")}
              </>
            ) : selectedResponseUnavailable &&
              listingStates?.[listingTypeFilter] !== "pending" ? null : (
              renderResultList(listingTypeFilter)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
