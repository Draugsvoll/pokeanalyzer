import { InfoTooltip } from "../../../../components/ui/InfoTooltip";
import type { EbayMode } from "../../../../../shared/ebaySearch";
import {
  POKETRACE_RAW_CONDITIONS,
  POKETRACE_RAW_CONDITION_LABELS,
  type PokeTraceRawCondition,
} from "../../../../../shared/pokeTraceMarketConditions";
import { useDualViewAvailable } from "../../../../components/marketplaceListings/useDualViewAvailable";
import {
  normalizeFilterText,
  getFilterKeywords,
} from "../../../../components/marketplaceListings/keywordFilters";
import {
  MarketplaceListings,
  MarketplaceResultPanel,
} from "../../../../components/marketplaceListings/MarketplaceListings";
import { MarketplaceResultRow } from "../../../../components/marketplaceListings/MarketplaceResultRow";
import {
  useEffect,
  useId,
  useMemo,
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
import { ArrowRight, Eye } from "lucide-react";
import { ClearFiltersButton } from "../../../../components/clearFiltersButton/ClearFiltersButton";
import { SelectDropdown } from "../../../../components/selectDropdown/SelectDropdown";
import { EbayImagePreview } from "./EbayImagePreview";
import type {
  EbayListingStatus,
  EbayListingType,
} from "../../../../../shared/ebaySearch";

const RESULTS_BATCH_SIZE = 15;
const FILTER_TRANSITION_MS = 250;

type EbaySoldViewProps = {
  response: EbayCompsResponse;
  children?: ReactNode;
  topControls?: ReactNode;
  initialListingType?: EbayListingType;
  listingStates?: Record<EbayListingType, EbayListingStatus>;
  mode?: EbayMode;
};

type EbaySortOrder = "price-asc" | "price-desc" | "date-desc" | "date-asc";
type ListingTypeFilter = "sold" | "active";
type ResultViewMode = "basic" | "advanced";
const GRADES = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"] as const;
type GradeFilter = "all" | (typeof GRADES)[number];
type GraderFilter = "all" | keyof typeof GRADING_COMPANY_PATTERNS;

const GRADE_FILTERS: { value: GradeFilter; label: string }[] = [
  { value: "all", label: "All grades" },
  ...GRADES.map((value) => ({ value, label: `Grade ${value}` })),
];
const GRADER_FILTERS: { value: GraderFilter; label: string }[] = [
  { value: "all", label: "All companies" },
  { value: "psa", label: "PSA" },
  { value: "cgc", label: "CGC" },
  { value: "bgs", label: "Beckett / BGS" },
  { value: "sgc", label: "SGC" },
  { value: "tag", label: "TAG" },
  { value: "gma", label: "GMA" },
  { value: "ace", label: "ACE" },
  { value: "hga", label: "HGA" },
  { value: "mgc", label: "MGC" },
  { value: "aog", label: "AOG" },
  { value: "jca", label: "JCA" },
  { value: "lcc", label: "LCC" },
  { value: "pcg", label: "PCG" },
  { value: "ags", label: "AGS" },
  { value: "cga", label: "CGA" },
  { value: "gemix", label: "GEMIX" },
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

function getAcceptedOfferPrice(result: EbayCompResult) {
  const acceptedPrice = getField(result, "acceptedOfferPrice");
  if (
    isTrue(getField(result, "bestOfferAccepted")) &&
    getField(result, "acceptedOfferPriceStatus") === "found" &&
    acceptedPrice &&
    Number.isFinite(Number(acceptedPrice)) &&
    Number(acceptedPrice) > 0
  ) {
    return acceptedPrice;
  }
  return undefined;
}

function getListingPrice(result: EbayCompResult) {
  return getField(result, "listingType") === "active"
    ? getField(result, "currentPrice")
    : (getAcceptedOfferPrice(result) ?? getField(result, "soldPrice"));
}

function getNumericSoldPrice(result: EbayCompResult) {
  const price = getListingPrice(result);
  if (!price) return null;

  const numericPrice = Number(price.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numericPrice) ? numericPrice : null;
}

function getPriceSummary(
  results: EbayCompResult[],
  listingType: ListingTypeFilter,
) {
  const currencyKey =
    listingType === "sold" ? "soldCurrency" : "currentCurrency";
  const pricesByCurrency = new Map<string, number[]>();

  for (const result of results) {
    const rawPrice = getListingPrice(result);
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
  content?: ReactNode;
};

function isMetadataItem(
  item: EbayListingMetadataItem | null,
): item is EbayListingMetadataItem {
  return Boolean(item);
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
    getListingPrice(result),
    getField(result, isActive ? "currentCurrency" : "soldCurrency"),
  );
  const shippingPrice = result.shippingPrice
    ? formatPrice(result.shippingPrice, result.shippingCurrency ?? undefined)
    : null;
  const shippingLabel = formatShipping(
    getField(result, "shippingType"),
    shippingPrice,
  );
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
    offerAccepted
      ? {
          label: getAcceptedOfferPrice(result)
            ? "Offer accepted"
            : "Offer accepted — open sale for final price",
          content: !getAcceptedOfferPrice(result) ? (
            <>
              Offer accepted
              <ArrowRight aria-hidden="true" data-testid="offer-price-arrow" />
              view sale for final price
            </>
          ) : undefined,
        }
      : null,
    timeLeft ? { label: `${timeLeft} left` } : null,
    buyItNowPrice ? { label: `Buy It Now ${buyItNowPrice}` } : null,
    watchers ? { label: watchers, icon: <Eye aria-hidden="true" /> } : null,
    isActive && shippingLabel ? { label: shippingLabel } : null,
  ];
  const metadataItems = metadataCandidates.filter(isMetadataItem);

  return (
    <MarketplaceResultRow
      title={title}
      titleContent={highlightHeadline(
        title,
        includeQuery,
        gradeFilter,
        graderFilter,
      )}
      metadataItems={metadataItems}
      price={price}
      url={url}
      linkLabel={isActive ? "Buy" : "View sale"}
      expansion={expansion}
      media={
        result.thumbnailUrl ? (
          <EbayImagePreview
            src={result.thumbnailUrl}
            previewSrc={result.fullResThumbnailUrl ?? undefined}
            title={title}
          />
        ) : (
          <div className="marketplace-listings__media" />
        )
      }
    />
  );
}

const GRADING_COMPANY_PATTERNS = {
  psa: "(?:psa|professional\\s*sports\\s*authenticator)",
  cgc: "(?:cgc|certified\\s*guaranty\\s*company)",
  bgs: "(?:bgs|beckett)",
  sgc: "(?:sgc|sportscard\\s*guaranty\\s*corporation)",
  tag: "tag",
  gma: "gma",
  ace: "ace",
  hga: "hga",
  mgc: "mgc",
  aog: "aog",
  jca: "jca",
  lcc: "lcc",
  pcg: "pcg",
  ags: "ags",
  cga: "cga",
  gemix: "gemix",
} as const;
const GRADING_COMPANY_PATTERN = `(?:${Object.values(GRADING_COMPANY_PATTERNS).join("|")})`;
const GRADE_DESCRIPTION_PATTERN =
  "(?:gem\\s*(?:mint|mt)|gem|near\\s*mint(?:\\s*(?:mint|mt))?|nm\\s*mt|(?:excellent|ex)\\s*(?:mint|mt)|very\\s*good|vg\\s*ex|vg|ex|nm|gd|fr|pr|poor|fair|good|excellent|mint|pristine|black\\s*label|perfect|graded?|grading|slabbed|certified)";
// Qualifiers belong to a grading phrase; never remove them from whole titles.
const GRADE_QUALIFIER_PATTERN = "(?:(?:new|old)\\s+)?";
const GRADE_DESCRIPTION_SEQUENCE_PATTERN = `${GRADE_QUALIFIER_PATTERN}(?:${GRADE_DESCRIPTION_PATTERN}\\s*){0,3}`;
const GRADE_END_PATTERN = "(?!half|\\d|st|nd|rd|th)";
const ANY_GRADE_PATTERN = `(?:10|[1-9](?:half)?)${GRADE_END_PATTERN}`;
const GRADING_MENTION_PATTERN = `${GRADING_COMPANY_PATTERN}\\s*${GRADE_DESCRIPTION_SEQUENCE_PATTERN}${ANY_GRADE_PATTERN}|tag\\s*${GRADE_QUALIFIER_PATTERN}pristine\\b`;
const GRADE_OUT_OF_TEN_PATTERN = new RegExp(
  `(\\b${GRADING_COMPANY_PATTERN}[\\s-]*${GRADE_DESCRIPTION_SEQUENCE_PATTERN}(?:10|[1-9])(?:\\s*\\.\\s*(?:0|5))?)\\s*/\\s*10\\b`,
  "g",
);
const NEGATED_GRADING_PATTERN = new RegExp(
  `\\b(?:not|non|no)\\s*(?:a\\s+)?(?:${GRADING_MENTION_PATTERN}|${GRADING_COMPANY_PATTERN}\\b)`,
  "g",
);
const PROJECTED_GRADING_PATTERN = new RegExp(
  `\\b(?:potential|possible)\\s+(?:${GRADING_MENTION_PATTERN})|\\b(?:${GRADING_MENTION_PATTERN})\\s+(?:candidate|contender)\\b`,
  "g",
);

function getGradingSearchText(result: EbayCompResult) {
  const searchableText = result.fields
    .filter((field) =>
      /title|condition|grade|grading|grader|certification/i.test(field.key),
    )
    .map((field) =>
      field.value
        .toLocaleLowerCase("en-US")
        .replace(/#\s*\d+/g, " | ")
        // Keep explicit scores such as PSA 10/10, and year separators.
        .replace(GRADE_OUT_OF_TEN_PATTERN, "$1")
        .replace(/(\d+(?:\.\d+)?)\s*[-\u2013]\s*((?:19|20)\d{2})\b/g, "$1 | $2")
        // Strip complete numeric ranges/fractions, not ordinal suffixes such as 1st.
        .replace(
          /\d+(?:\.\d+)?\s*[/\u2013-]\s*\d+(?:\.\d+)?(?!\w|\.\d)/g,
          " | ",
        )
        .replace(/(\d)\s*\.\s*5(?!\d)/g, "$1half")
        .replace(/(\d)\s*\.\s*0(?!\d)/g, "$1")
        .replace(/\d+\s*\.\s*\d+/g, " | ")
        .replace(/[^a-z0-9#|]+/g, " ")
        // Remove only explicit negative/projected grading mentions. A barrier
        // prevents the remaining words from forming a new grading phrase.
        .replace(NEGATED_GRADING_PATTERN, " | ")
        .replace(PROJECTED_GRADING_PATTERN, " | ")
        .trim(),
    )
    // Keep independent response fields from creating a phrase together.
    .join(" | ");
  return { searchableText };
}

function getGradeHighlightPattern(grade: Exclude<GradeFilter, "all">) {
  const gradeNumber = String.raw`${grade}(?:\s*\.\s*(?:0|5))?\b(?!\s*[/.–-]\s*\d)`;
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
            : grade === "6"
              ? String.raw`(?:excellent(?:\s+|-)mint|ex(?:\s+|-)(?:mint|mt))`
              : "";
  const description = [
    condition,
    gradeWord,
    "pristine",
    "black[\\s-]+label",
    "perfect",
  ]
    .filter(Boolean)
    .join("|");
  const tagGrade = String.raw`\btag(?:[\s-]+(?:grading|pristine))?[\s-]*${gradeNumber}`;
  const tagPristine = grade === "10" ? String.raw`|\btag[\s-]+pristine\b` : "";

  // Highlight only explicit forward grade phrases; skip ambiguous reverse
  // notation and arbitrary words between a grader and a number.
  return String.raw`${tagGrade}${tagPristine}|\b(?:${grader})[\s-]*(?:(?:${description})[\s-]*)?${gradeNumber}|\b(?:${gradeWord})[\s-]*${gradeNumber}${condition ? String.raw`|\b(?:${condition})[\s-]*${gradeNumber}` : ""}`;
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
    default:
      return String.raw`\b${GRADING_COMPANY_PATTERNS[grader]}(?=\b|\d)`;
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
      <mark
        className="marketplace-listings__keyword-mark"
        key={`${part}-${index}`}
      >
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

const RAW_CONDITION_LABELS: Record<PokeTraceRawCondition, string> = {
  NEAR_MINT: "NM",
  LIGHTLY_PLAYED: "LP",
  MODERATELY_PLAYED: "MP",
  HEAVILY_PLAYED: "HP",
  DAMAGED: "DMG",
};

const RAW_CONDITION_PATTERNS: Record<PokeTraceRawCondition, RegExp> = {
  NEAR_MINT: /\b(?:near[ -]?mint|nm|mint)\b/i,
  LIGHTLY_PLAYED: /\b(?:light(?:ly)?[ -]?played|lp|excellent)\b/i,
  MODERATELY_PLAYED: /\b(?:moderate(?:ly)?[ -]?played|mp|very good)\b/i,
  HEAVILY_PLAYED: /\b(?:heav(?:y|ily)[ -]?played|hp|poor)\b/i,
  DAMAGED: /\b(?:damaged|dmg)\b/i,
};

// eBay's top-level condition may only say "Ungraded"; use explicit
// condition phrases/abbreviations in the listing when a condition is requested.
function matchesRawCondition(
  result: EbayCompResult,
  condition: PokeTraceRawCondition,
) {
  const text = [getField(result, "condition"), getField(result, "title")]
    .filter(Boolean)
    .join(" ");
  const conditionText =
    condition === "HEAVILY_PLAYED"
      ? text.replace(/\b\d+\s*hp\b|\bhp\s*\d+\b/gi, " ")
      : text;
  return RAW_CONDITION_PATTERNS[condition].test(conditionText);
}

function matchesGrader(
  result: EbayCompResult,
  grader: Exclude<GraderFilter, "all">,
  gradingText = getGradingSearchText(result),
) {
  const { searchableText } = gradingText;

  if (grader === "tag") {
    // A bare TAG can refer to a Pokemon Tag Team card.
    return new RegExp(
      `\\btag\\s*${GRADE_DESCRIPTION_SEQUENCE_PATTERN}${ANY_GRADE_PATTERN}|\\btag\\s*${GRADE_QUALIFIER_PATTERN}(?:grading|pristine)\\b`,
    ).test(searchableText);
  }
  return new RegExp(
    `\\b${GRADING_COMPANY_PATTERNS[grader]}(?=\\b|\\d|(?:${GRADE_DESCRIPTION_PATTERN}\\s*){1,3}${ANY_GRADE_PATTERN})`,
  ).test(searchableText);
}

function matchesGrade(
  result: EbayCompResult,
  grade: Exclude<GradeFilter, "all">,
  gradingText = getGradingSearchText(result),
) {
  const { searchableText } = gradingText;
  // Retain spaces between grades, years and card numbers. Ordinal suffixes
  // reject 1st/2nd/3rd/4th without deleting text or bridging to another number.
  const gradeToken = `${grade}${grade === "10" ? "" : "(?:half)?"}${GRADE_END_PATTERN}`;
  if (
    new RegExp(
      `\\b${GRADING_COMPANY_PATTERN}\\s*${GRADE_DESCRIPTION_SEQUENCE_PATTERN}${gradeToken}`,
    ).test(searchableText) ||
    new RegExp(
      `\\b${GRADE_DESCRIPTION_PATTERN}\\s+${gradeToken}\\s+${GRADING_COMPANY_PATTERN}\\b`,
    ).test(searchableText) ||
    new RegExp(
      `\\b(?:grade|graded|grading|slab|slabbed|encased|certified)\\s*${gradeToken}|(?:^|\\s)${gradeToken}\\s*(?:graded|grade|slab|slabbed|encased|certified)\\b`,
    ).test(searchableText)
  )
    return true;

  if (
    grade === "10" &&
    (new RegExp(`\\btag\\s*${GRADE_QUALIFIER_PATTERN}pristine\\b`).test(
      searchableText,
    ) ||
      new RegExp(`\\bpristine\\s+${gradeToken}\\b`).test(searchableText))
  )
    return true;

  // Explicit condition-and-number phrases remain useful when the title
  // omits the grading company. Bare card numbers never qualify on their own.
  let condition: string;
  switch (grade) {
    case "6":
      condition = "(?:excellent\\s*mint|ex\\s*(?:mint|mt))";
      break;
    case "7":
      condition = "(?:near\\s*mint|nm)(?!\\s*(?:mint|mt))";
      break;
    case "8":
      condition = "(?:near\\s*mint\\s*(?:mint|mt)|nm\\s*mt)";
      break;
    case "9":
      condition = "(?<!gem|gem\\s|near|near\\s)mint";
      break;
    case "10":
      condition = "gem\\s*(?:mint|mt)";
      break;
    default:
      return false;
  }
  return new RegExp(
    `\\b${condition}\\s*${gradeToken}|(?:^|\\s)${gradeToken}\\s*${condition}\\b`,
  ).test(searchableText);
}

export default function EbaySoldView({
  response,
  children,
  topControls,
  initialListingType = "sold",
  listingStates,
  mode = "graded",
}: EbaySoldViewProps) {
  const filterGroupName = useId();
  const [rawCondition, setRawCondition] = useState<
    "all" | PokeTraceRawCondition
  >("all");
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
  const advancedView = dualViewAvailable && resultViewMode === "advanced";

  useEffect(
    () => () => {
      window.clearTimeout(filterTimerRef.current);
    },
    [],
  );

  const { results: eligibleResults, splitResponse } = useMemo(() => {
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
    function getResults(listingType: ListingTypeFilter) {
      const listingResponse = splitResponse
        ? splitResponse[listingType]
        : listingType === "sold"
          ? responseData
          : null;
      return getVisibleEbayCompResults(listingResponse).filter((result) => {
        const price = getNumericSoldPrice(result);
        return (
          getField(result, "listingType") === listingType &&
          (price === null || price > 1)
        );
      });
    }
    return {
      results: { sold: getResults("sold"), active: getResults("active") },
      splitResponse,
    };
  }, [response]);

  const baseResults = useMemo(() => {
    const filter = (results: EbayCompResult[]) =>
      results.filter(
        (result) =>
          (mode !== "raw" ||
            rawCondition === "all" ||
            matchesRawCondition(result, rawCondition)) &&
          (!appliedTextFilter ||
            matchesTextFilter(result, appliedTextFilter)) &&
          (!appliedExcludeFilter ||
            !matchesAnyTextFilter(result, appliedExcludeFilter)) &&
          (appliedGraderFilter === "all" ||
            matchesGrader(result, appliedGraderFilter)),
      );
    return {
      sold: filter(eligibleResults.sold),
      active: filter(eligibleResults.active),
    };
  }, [
    eligibleResults,
    mode,
    rawCondition,
    appliedTextFilter,
    appliedExcludeFilter,
    appliedGraderFilter,
  ]);

  const rawConditionCounts = useMemo(() => {
    const counts = Object.fromEntries(
      POKETRACE_RAW_CONDITIONS.map((condition) => [condition, 0]),
    ) as Record<PokeTraceRawCondition, number>;
    if (mode !== "raw") return counts;
    const results = advancedView
      ? [...eligibleResults.sold, ...eligibleResults.active]
      : eligibleResults[listingTypeFilter];
    for (const result of results) {
      for (const condition of POKETRACE_RAW_CONDITIONS) {
        if (matchesRawCondition(result, condition)) counts[condition]++;
      }
    }
    return counts;
  }, [eligibleResults, advancedView, listingTypeFilter, mode]);

  const availableRawConditions = POKETRACE_RAW_CONDITIONS.filter(
    (condition) => rawConditionCounts[condition] > 0,
  );

  if (
    mode === "raw" &&
    rawCondition !== "all" &&
    rawConditionCounts[rawCondition] === 0
  ) {
    setRawCondition("all");
  }

  const gradeCounts = useMemo(() => {
    const counts = Object.fromEntries(
      GRADES.map((grade) => [grade, 0]),
    ) as Record<Exclude<GradeFilter, "all">, number>;
    if (mode !== "graded") return counts;
    const results = advancedView
      ? [...eligibleResults.sold, ...eligibleResults.active]
      : eligibleResults[listingTypeFilter];
    for (const result of results) {
      const gradingText = getGradingSearchText(result);
      for (const grade of GRADES) {
        if (matchesGrade(result, grade, gradingText)) counts[grade]++;
      }
    }
    return counts;
  }, [eligibleResults, advancedView, listingTypeFilter, mode]);

  const graderCounts = useMemo(() => {
    const counts = Object.fromEntries(
      Object.keys(GRADING_COMPANY_PATTERNS).map((grader) => [grader, 0]),
    ) as Record<Exclude<GraderFilter, "all">, number>;
    if (mode !== "graded") return counts;
    const results = advancedView
      ? [...eligibleResults.sold, ...eligibleResults.active]
      : eligibleResults[listingTypeFilter];
    for (const result of results) {
      const gradingText = getGradingSearchText(result);
      for (const grader of GRADER_FILTERS) {
        if (
          grader.value !== "all" &&
          matchesGrader(result, grader.value, gradingText)
        )
          counts[grader.value]++;
      }
    }
    return counts;
  }, [eligibleResults, advancedView, listingTypeFilter, mode]);

  if (
    mode === "graded" &&
    ((graderFilter !== "all" && graderCounts[graderFilter] === 0) ||
      (appliedGraderFilter !== "all" &&
        graderCounts[appliedGraderFilter] === 0))
  ) {
    setGraderFilter("all");
    setAppliedGraderFilter("all");
  }

  const availableGrades = GRADE_FILTERS.filter(
    (filter) => filter.value === "all" || gradeCounts[filter.value] > 0,
  );
  const availableGraders = GRADER_FILTERS.filter(
    (filter) => filter.value === "all" || graderCounts[filter.value] > 0,
  );

  if (
    mode === "graded" &&
    ((gradeFilter !== "all" && gradeCounts[gradeFilter] === 0) ||
      (appliedGradeFilter !== "all" && gradeCounts[appliedGradeFilter] === 0))
  ) {
    setGradeFilter("all");
    setAppliedGradeFilter("all");
  }

  const selectedResponseUnavailable = Boolean(
    splitResponse && !splitResponse[listingTypeFilter],
  );
  function getSortedResults(listingType: ListingTypeFilter) {
    const filteredResults =
      appliedGradeFilter === "all"
        ? baseResults[listingType]
        : baseResults[listingType].filter((result) =>
            matchesGrade(result, appliedGradeFilter),
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
    setRawCondition("all");
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

  const hasFilters =
    rawCondition !== "all" ||
    gradeFilter !== "all" ||
    graderFilter !== "all" ||
    textFilter.trim().length > 0 ||
    excludeFilter.trim().length > 0;
  function renderResultList(listingType: ListingTypeFilter) {
    const results = resultsByType[listingType];
    const visible = results.slice(0, visibleResultCounts[listingType]);
    const unavailable = Boolean(splitResponse && !splitResponse[listingType]);
    const loading = listingStates?.[listingType] === "pending";
    const label = listingType === "sold" ? "Sold" : "Listed";
    const priceSummary = getPriceSummary(results, listingType);

    return (
      <MarketplaceResultPanel
        label={label}
        ariaLabel={
          listingType === "sold" ? "Sold Ebay results" : "Listed Ebay results"
        }
        count={`${results.length} ${results.length === 1 ? "result" : "results"}`}
        summary={priceSummary}
        dual={advancedView}
        loading={loading}
        busy={filtering}
        loadingLabel={`Loading ${label.toLowerCase()} Ebay results`}
        state={
          !unavailable && visible.length === 0 ? (
            <p className="marketplace-listings__state">
              No matching Ebay {listingType === "sold" ? "sales" : "listings"}{" "}
              found.
            </p>
          ) : undefined
        }
        resultsKey={`${rawCondition}-${listingType}-${appliedGradeFilter}-${appliedGraderFilter}-${appliedTextFilter}-${appliedExcludeFilter}-${sortOrder}`}
        onScroll={(event) => handleResultScroll(event, listingType)}
      >
        {visible.map((result, index) => (
          <EbayResultCard
            expansion={expansion}
            key={
              getField(result, "url") ?? `${getField(result, "title")}-${index}`
            }
            gradeFilter={appliedGradeFilter}
            graderFilter={appliedGraderFilter}
            includeQuery={appliedTextFilter}
            isActive={listingType === "active"}
            result={result}
          />
        ))}
      </MarketplaceResultPanel>
    );
  }

  return (
    <MarketplaceListings
      source="Ebay"
      side={listingTypeFilter}
      onSideChange={handleListingTypeChange}
      sort={sortOrder}
      onSortChange={handleSortChange}
      dual={advancedView}
      dualAvailable={dualViewAvailable}
      onDualChange={(dual) => setResultViewMode(dual ? "advanced" : "basic")}
      sideStates={listingStates}
      expansion={expansion}
      onExpandChange={(expanded) => setExpansion({ expanded })}
      busy={filtering}
      showResults={response != null}
      clearFilters={
        hasFilters && (
          <ClearFiltersButton label="Clear filters" onClick={clearFilters} />
        )
      }
      filters={
        <div className="ebay-section__filters">
          {topControls}
          {mode === "raw" ? (
            <div className="marketplace-listings__condition-controls">
              <fieldset
                aria-label="Condition"
                className="marketplace-listings__filters radio-group"
              >
                <div>
                  {(["all", ...availableRawConditions] as const).map(
                    (value) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name={`${filterGroupName}-condition`}
                          aria-label={
                            value === "all"
                              ? "All"
                              : POKETRACE_RAW_CONDITION_LABELS[value]
                          }
                          value={value}
                          checked={rawCondition === value}
                          onChange={() => {
                            setRawCondition(value);
                            resetVisibleResults();
                          }}
                        />
                        <span>
                          {value === "all"
                            ? "All"
                            : RAW_CONDITION_LABELS[value]}
                          {value !== "all" && (
                            <small className="ui-select-dropdown__count">
                              ({rawConditionCounts[value]})
                            </small>
                          )}
                        </span>
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
              <InfoTooltip
                className="marketplace-listings__condition-help"
                label="How eBay condition filters work"
                title="Condition filter"
              >
                <span>
                  Filters by title. Many listings don't specify condition.
                </span>
              </InfoTooltip>
            </div>
          ) : (
            <div className="marketplace-listings__grade-controls">
              <div
                className={`marketplace-listings__grader-filter${gradeFilter === "all" ? "" : " marketplace-listings__grader-filter--active"}`}
              >
                <SelectDropdown<GradeFilter>
                  ariaLabel="Filter by grade"
                  compact
                  options={availableGrades.map((filter) => ({
                    ...filter,
                    ...(filter.value !== "all"
                      ? { count: gradeCounts[filter.value] }
                      : {}),
                  }))}
                  value={gradeFilter}
                  onChange={handleGradeFilterChange}
                />
              </div>
              <div
                className={`marketplace-listings__grader-filter${graderFilter === "all" ? "" : " marketplace-listings__grader-filter--active"}`}
              >
                <SelectDropdown
                  ariaLabel="Filter by grading company"
                  compact
                  options={availableGraders.map((filter) => ({
                    ...filter,
                    ...(filter.value !== "all"
                      ? { count: graderCounts[filter.value] }
                      : {}),
                  }))}
                  value={graderFilter}
                  onChange={handleGraderFilterChange}
                />
              </div>
            </div>
          )}
        </div>
      }
      keywordFilters={{
        include: textFilter,
        exclude: excludeFilter,
        onIncludeChange: handleTextFilterChange,
        onExcludeChange: handleExcludeFilterChange,
      }}
      renderPanel={(side) =>
        !advancedView &&
        selectedResponseUnavailable &&
        listingStates?.[side] !== "pending"
          ? null
          : renderResultList(side)
      }
    >
      {children}
    </MarketplaceListings>
  );
}
