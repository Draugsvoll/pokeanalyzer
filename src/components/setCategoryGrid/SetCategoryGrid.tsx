import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { POKETRACE_SEARCH_PAGE_SIZE } from "../../../shared/pokeTraceSearch";
import type { PokeTraceSetSalesLeaders } from "../../../shared/pokeTraceSet";
import {
  POKETRACE_RAW_CONDITION_LABELS,
  type PokeTraceRawCondition,
} from "../../../shared/pokeTraceMarketConditions";
import {
  usePokeTraceSetNameOptions,
  type PokeTraceSetNameOption,
} from "../../hooks/usePokeTraceSetNameOptions";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { isAbortError } from "../../hooks/useAbortableRequest";
import { loadPokeTraceSet } from "../../services/pokeTraceSets";
import {
  loadPokeTraceSetFromSession,
  savePokeTraceSetToSession,
} from "../../services/pokeTraceSetSessionCache";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import { formatDateStamp } from "../../utils/formatDateStamp";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";
import { waitForUiPaint } from "../../utils/waitForUiPaint";
import {
  POKETRACE_DEFAULT_CARD_SORT,
  sortPokeTraceCards,
  type PokeTraceCardSort,
} from "../../utils/sortPokeTraceCards";
import { AutosuggestCombobox } from "../autosuggestCombobox/AutosuggestCombobox";
import { CardCategoryGrid } from "../cardCategoryGrid/CardCategoryGrid";
import { FilterInput } from "../filterInput/FilterInput";
import { PokeTraceSortDropdown } from "../pokeTraceSortDropdown/PokeTraceSortDropdown";
import { PriceChange } from "../priceChange/PriceChange";
import { formatPriceChangeAccessibleLabel } from "../priceChange/priceChangeUtils";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import { SetExplorerOverview } from "./SetExplorerOverview";
import {
  getSetDirectoryMetadata,
  type SetDirectoryMetadata,
} from "./setDirectoryMetadata";
import { selectUniqueSetCards, type SetCardScope } from "./setCardScope";
import { buildSetExplorerOverview } from "./setExplorerMetrics";
import "./SetCategoryGrid.scss";

const INVALID_SET_MESSAGE =
  "Choose a set from the suggestions before opening it.";
const DEFAULT_CONDITION: PokeTraceRawCondition = "NEAR_MINT";
const DEFAULT_CARD_SCOPE: SetCardScope = "unique";
const OTHER_SET_ERA = "Other";

type SetDirectoryChronologicalSort = "newest" | "oldest";
type SetDirectorySort =
  SetDirectoryChronologicalSort | "change-high-low" | "change-low-high";

const SET_DIRECTORY_SORT_OPTIONS: Array<{
  label: string;
  value: SetDirectorySort;
}> = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "% Change: high–low", value: "change-high-low" },
  { label: "% Change: low–high", value: "change-low-high" },
];

type SetDirectoryOption = PokeTraceSetNameOption & SetDirectoryMetadata;

function enrichSetDirectoryOption(
  option: PokeTraceSetNameOption,
): SetDirectoryOption {
  const metadata = getSetDirectoryMetadata(option.value);
  return metadata ? { ...option, ...metadata } : option;
}

function setDirectoryDetails(option: SetDirectoryOption) {
  return [
    option.releaseYear?.toString(),
    option.cardCount == null
      ? null
      : `${option.cardCount.toLocaleString("en-US")} ${
          option.cardCount === 1 ? "card" : "cards"
        }`,
  ].filter((detail): detail is string => Boolean(detail));
}

function compareSetReleaseYears(
  left: SetDirectoryOption,
  right: SetDirectoryOption,
  sort: SetDirectoryChronologicalSort,
) {
  if (left.releaseYear == null && right.releaseYear == null) {
    return left.label.localeCompare(right.label, "en-US", {
      sensitivity: "base",
    });
  }
  if (left.releaseYear == null) return 1;
  if (right.releaseYear == null) return -1;

  return (
    (sort === "newest"
      ? right.releaseYear - left.releaseYear
      : left.releaseYear - right.releaseYear) ||
    left.label.localeCompare(right.label, "en-US", { sensitivity: "base" })
  );
}

function compareSetDirectoryOptions(
  left: SetDirectoryOption,
  right: SetDirectoryOption,
  sort: SetDirectorySort,
) {
  if (sort === "newest" || sort === "oldest") {
    return compareSetReleaseYears(left, right, sort);
  }

  const leftChange = left.setSummary?.sevenDayChangePercent ?? null;
  const rightChange = right.setSummary?.sevenDayChangePercent ?? null;
  if (leftChange === null && rightChange !== null) return 1;
  if (leftChange !== null && rightChange === null) return -1;
  if (
    leftChange !== null &&
    rightChange !== null &&
    leftChange !== rightChange
  ) {
    return sort === "change-high-low"
      ? rightChange - leftChange
      : leftChange - rightChange;
  }

  return compareSetReleaseYears(left, right, "newest");
}

function eraReleaseYear(
  options: readonly SetDirectoryOption[],
  sort: SetDirectorySort,
) {
  const releaseYears = options.flatMap(({ releaseYear }) =>
    releaseYear == null ? [] : [releaseYear],
  );
  if (releaseYears.length === 0) return null;
  return sort === "oldest"
    ? Math.min(...releaseYears)
    : Math.max(...releaseYears);
}

function groupSetDirectoryOptions(
  options: readonly SetDirectoryOption[],
  sort: SetDirectorySort,
) {
  const optionsByEra = new Map<string, SetDirectoryOption[]>();

  for (const option of options) {
    const era = option.era ?? OTHER_SET_ERA;
    const eraOptions = optionsByEra.get(era);
    if (eraOptions) eraOptions.push(option);
    else optionsByEra.set(era, [option]);
  }

  for (const eraOptions of optionsByEra.values()) {
    eraOptions.sort((left, right) =>
      compareSetDirectoryOptions(left, right, sort),
    );
  }

  return [...optionsByEra.entries()].sort(
    ([leftEra, leftOptions], [rightEra, rightOptions]) => {
      if (leftEra === OTHER_SET_ERA) return 1;
      if (rightEra === OTHER_SET_ERA) return -1;

      const leftYear = eraReleaseYear(leftOptions, sort);
      const rightYear = eraReleaseYear(rightOptions, sort);
      if (leftYear == null && rightYear == null) {
        return leftEra.localeCompare(rightEra, "en-US", {
          sensitivity: "base",
        });
      }
      if (leftYear == null) return 1;
      if (rightYear == null) return -1;

      return (
        (sort === "oldest" ? leftYear - rightYear : rightYear - leftYear) ||
        leftEra.localeCompare(rightEra, "en-US", { sensitivity: "base" })
      );
    },
  );
}

type SetDirectoryCardProps = {
  active: boolean;
  disabled: boolean;
  onOpen: (setName: string) => void;
  option: SetDirectoryOption;
};

function SetDirectoryCard({
  active,
  disabled,
  onOpen,
  option,
}: SetDirectoryCardProps) {
  const details = setDirectoryDetails(option);
  const changeDescriptionId = useId();
  const changePercent = option.setSummary?.sevenDayChangePercent;
  const changeTitle = option.setSummary
    ? `7-day Near Mint set value change as of ${formatDateStamp(option.setSummary.asOf)}`
    : null;

  return (
    <button
      aria-current={active ? "true" : undefined}
      aria-describedby={
        changePercent != null && changeTitle != null
          ? changeDescriptionId
          : undefined
      }
      aria-label={`Open ${option.label}`}
      className={`set-category-grid__set-card ui-render-fade${active ? " is-active" : ""}`}
      disabled={disabled}
      onClick={() => onOpen(option.value)}
      type="button"
    >
      <span className="set-category-grid__set-name" title={option.label}>
        {option.label}
      </span>
      {details.length > 0 && (
        <span
          className="set-category-grid__set-metadata"
          title={details.join(" · ")}
        >
          {details.join(" · ")}
        </span>
      )}
      {changePercent != null && changeTitle != null && (
        <>
          <PriceChange
            animate
            className="set-category-grid__set-change"
            percent={changePercent}
            period="7d"
            title={changeTitle}
          />
          <span
            className="set-category-grid__visually-hidden"
            id={changeDescriptionId}
          >
            {formatPriceChangeAccessibleLabel(changePercent, changeTitle)}
          </span>
        </>
      )}
    </button>
  );
}

type SetDirectoryGroupProps = {
  activeSetName: string | null;
  disabled: boolean;
  era: string;
  onOpen: (setName: string) => void;
  options: SetDirectoryOption[];
};

function SetDirectoryGroup({
  activeSetName,
  disabled,
  era,
  onOpen,
  options,
}: SetDirectoryGroupProps) {
  const revealRef = useScrollReveal<HTMLElement>();

  return (
    <section
      className="set-category-grid__era-group ui-scroll-reveal"
      ref={revealRef}
    >
      <header className="set-category-grid__era-header">
        <h3>{era}</h3>
        <span>
          {options.length.toLocaleString("en-US")}{" "}
          {options.length === 1 ? "set" : "sets"}
        </span>
      </header>
      <div className="set-category-grid__set-list">
        {options.map((option) => (
          <SetDirectoryCard
            active={activeSetName === option.value}
            disabled={disabled}
            key={option.value}
            onOpen={onOpen}
            option={option}
          />
        ))}
      </div>
    </section>
  );
}

function cardMatchesFilter(card: PokemonCard, filter: string) {
  const terms = filter
    .trim()
    .toLocaleLowerCase("en-US")
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = [
    card.name,
    card.set.name,
    card.number,
    card.rarity,
    card.pokeTrace.variant,
    ...(card.pokeTrace.variants?.map(({ name }) => name) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");

  return terms.every((term) => searchableText.includes(term));
}

export function SetCategoryGrid() {
  const validationId = useId();
  const setNameOptions = usePokeTraceSetNameOptions();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSetParameter = searchParams.get("set")?.trim() ?? "";
  const requestControllerRef = useRef<AbortController | null>(null);
  const sortRequestIdRef = useRef(0);
  const [inputValue, setInputValue] = useState(requestedSetParameter);
  const [eraFilter, setEraFilter] = useState("");
  const [directorySort, setDirectorySort] =
    useState<SetDirectorySort>("newest");
  const [selectedSetName, setSelectedSetName] = useState<string | null>(null);
  const [activeSetName, setActiveSetName] = useState<string | null>(null);
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [cardScope, setCardScope] = useState<SetCardScope>(DEFAULT_CARD_SCOPE);
  const [appliedCardScope, setAppliedCardScope] =
    useState<SetCardScope>(DEFAULT_CARD_SCOPE);
  const [isScopePending, startScopeTransition] = useTransition();
  const [salesLeaders, setSalesLeaders] =
    useState<PokeTraceSetSalesLeaders | null>(null);
  const [cardFilter, setCardFilter] = useState("");
  const [sort, setSort] = useState<PokeTraceCardSort>(
    POKETRACE_DEFAULT_CARD_SORT,
  );
  const [isSorting, setIsSorting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(POKETRACE_SEARCH_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(
    () => () => {
      sortRequestIdRef.current += 1;
      const controller = requestControllerRef.current;
      requestControllerRef.current = null;
      controller?.abort();
    },
    [],
  );

  const isUpdatingResults = isSorting || isScopePending;
  const scopedCards = useMemo(
    () => (appliedCardScope === "unique" ? selectUniqueSetCards(cards) : cards),
    [appliedCardScope, cards],
  );
  const filteredCards = useMemo(
    () => scopedCards.filter((card) => cardMatchesFilter(card, cardFilter)),
    [cardFilter, scopedCards],
  );
  const sortedCards = useMemo(
    () =>
      sortPokeTraceCards(filteredCards, sort, {
        condition: DEFAULT_CONDITION,
      }),
    [filteredCards, sort],
  );
  const overview = useMemo(
    () => buildSetExplorerOverview(scopedCards, salesLeaders, cards),
    [cards, salesLeaders, scopedCards],
  );
  const visibleCards = sortedCards.slice(0, visibleCount);
  const normalizedSetFilter = inputValue.trim().toLocaleLowerCase("en-US");
  const setDirectoryOptions = useMemo(
    () => setNameOptions.map(enrichSetDirectoryOption),
    [setNameOptions],
  );
  const requestedSetName = useMemo(() => {
    if (!requestedSetParameter) return null;
    return (
      setNameOptions.find(
        (option) =>
          option.value.localeCompare(requestedSetParameter, "en-US", {
            sensitivity: "base",
          }) === 0,
      )?.value ?? null
    );
  }, [requestedSetParameter, setNameOptions]);
  const highlightedSetName = loading
    ? (requestedSetName ?? activeSetName)
    : activeSetName;
  const setEraOptions = useMemo(
    () => [
      { label: "Any Era", value: "" },
      ...groupSetDirectoryOptions(setDirectoryOptions, directorySort).map(
        ([era]) => ({ label: era, value: era }),
      ),
    ],
    [directorySort, setDirectoryOptions],
  );
  const filteredSetOptions = useMemo(
    () =>
      setDirectoryOptions.filter((option) => {
        const era = option.era ?? OTHER_SET_ERA;
        return (
          (!normalizedSetFilter ||
            option.label
              .toLocaleLowerCase("en-US")
              .includes(normalizedSetFilter)) &&
          (!eraFilter || era === eraFilter)
        );
      }),
    [eraFilter, normalizedSetFilter, setDirectoryOptions],
  );
  const groupedSetOptions = useMemo(
    () => groupSetDirectoryOptions(filteredSetOptions, directorySort),
    [directorySort, filteredSetOptions],
  );

  const openSet = useCallback(async (setName: string) => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    sortRequestIdRef.current += 1;
    setIsSorting(false);
    setInvalid(false);
    setError(null);
    setCardScope(DEFAULT_CARD_SCOPE);
    setAppliedCardScope(DEFAULT_CARD_SCOPE);

    const cached = loadPokeTraceSetFromSession(setName);
    if (cached) {
      setCards(cached.cards);
      setSalesLeaders(cached.salesLeaders);
      setActiveSetName(setName);
      setCardFilter("");
      setSort(POKETRACE_DEFAULT_CARD_SORT);
      setVisibleCount(POKETRACE_SEARCH_PAGE_SIZE);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);

    try {
      const result = await loadPokeTraceSet(setName, controller.signal);
      if (controller.signal.aborted) return;
      savePokeTraceSetToSession(setName, result);
      setCards(result.cards);
      setSalesLeaders(result.salesLeaders);
      setActiveSetName(setName);
      setCardFilter("");
      setSort(POKETRACE_DEFAULT_CARD_SORT);
      setVisibleCount(POKETRACE_SEARCH_PAGE_SIZE);
    } catch (requestError) {
      if (controller.signal.aborted || isAbortError(requestError)) return;
      logClientError("Failed to open PokeTrace set", requestError);
      setCards([]);
      setSalesLeaders(null);
      setActiveSetName(null);
      setError("This set is temporarily unavailable. Please try again.");
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  // The URL is the durable source of the opened set, so browser navigation must
  // deliberately synchronize the local request and presentation state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!requestedSetParameter || !requestedSetName) {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      setActiveSetName(null);
      setCards([]);
      setSalesLeaders(null);
      setError(null);
      setLoading(false);
      return;
    }

    setInputValue(requestedSetName);
    setSelectedSetName(requestedSetName);
    setInvalid(false);
    void openSet(requestedSetName);
  }, [openSet, requestedSetName, requestedSetParameter]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function requestSetOpen(setName: string) {
    const currentSetParameter = searchParams.get("set")?.trim() ?? "";
    if (
      currentSetParameter.localeCompare(setName, "en-US", {
        sensitivity: "base",
      }) === 0
    ) {
      if (activeSetName !== setName) void openSet(setName);
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("set", setName);
    setSearchParams(nextSearchParams, { replace: true });
  }

  function openSelectedSet() {
    if (!selectedSetName || inputValue !== selectedSetName) {
      setInvalid(true);
      return;
    }

    requestSetOpen(selectedSetName);
  }

  function openSetFromDirectory(setName: string) {
    setInputValue(setName);
    setSelectedSetName(setName);
    setInvalid(false);
    requestSetOpen(setName);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    openSelectedSet();
  }

  function handleCardScopeChange(nextScope: SetCardScope) {
    if (nextScope === cardScope || isUpdatingResults) return;
    setCardScope(nextScope);
    startScopeTransition(() => {
      setAppliedCardScope(nextScope);
      setVisibleCount(POKETRACE_SEARCH_PAGE_SIZE);
    });
  }

  async function handleSortChange(nextSort: PokeTraceCardSort) {
    if (nextSort === sort || isUpdatingResults) return;
    const requestId = ++sortRequestIdRef.current;
    setIsSorting(true);
    try {
      await waitForUiPaint();
      if (requestId !== sortRequestIdRef.current) return;
      setSort(nextSort);
      setVisibleCount(POKETRACE_SEARCH_PAGE_SIZE);
    } finally {
      if (requestId === sortRequestIdRef.current) {
        setIsSorting(false);
      }
    }
  }

  function cancelPendingRequest() {
    sortRequestIdRef.current += 1;
    const controller = requestControllerRef.current;
    requestControllerRef.current = null;
    controller?.abort();
    setLoading(false);
    setIsSorting(false);
  }

  function resetSetFilter() {
    cancelPendingRequest();
    setInputValue("");
    setSelectedSetName(null);
    setInvalid(false);
  }

  const setPicker = (
    <div className="set-category-grid__picker">
      <AutosuggestCombobox
        ariaLabel="Set name"
        className={`set-category-grid__combobox${invalid ? " is-invalid" : ""}`}
        clearLabel="Clear set filter"
        inputAriaDescribedBy={invalid ? validationId : undefined}
        inputAriaInvalid={invalid}
        indicator="search"
        menuLabel="Set name suggestions"
        onClear={resetSetFilter}
        onInputChange={(value) => {
          cancelPendingRequest();
          setInputValue(value);
          setSelectedSetName(null);
          setInvalid(false);
        }}
        onKeyDown={handleInputKeyDown}
        onSelect={(value) => {
          cancelPendingRequest();
          setInputValue(value);
          setSelectedSetName(value);
          setInvalid(false);
        }}
        options={setNameOptions}
        placeholder="Set"
        value={inputValue}
      />
      <span className="set-category-grid__visually-hidden" id={validationId}>
        {INVALID_SET_MESSAGE}
      </span>
    </div>
  );

  const eraSelector = (
    <div className="set-category-grid__directory-select">
      <SelectDropdown
        ariaLabel="Filter sets by era"
        className="set-category-grid__era-select"
        onChange={setEraFilter}
        options={setEraOptions}
        value={eraFilter}
      />
    </div>
  );

  const directorySortSelector = (
    <div className="set-category-grid__directory-select set-category-grid__directory-select--sort">
      <SelectDropdown
        ariaLabel="Sort set directory"
        className="set-category-grid__directory-sort"
        onChange={setDirectorySort}
        options={SET_DIRECTORY_SORT_OPTIONS}
        value={directorySort}
      />
    </div>
  );

  const resultControls = (
    <div
      aria-label="Set card controls"
      className="set-category-grid__result-controls ui-render-fade"
      role="group"
    >
      <FilterInput
        ariaLabel="Filter set cards"
        className="set-category-grid__card-filter"
        clearLabel="Clear card filter"
        onChange={(value) => {
          setCardFilter(value);
          setVisibleCount(POKETRACE_SEARCH_PAGE_SIZE);
        }}
        placeholder="Filter"
        value={cardFilter}
      />
      <div className="set-category-grid__sort-control">
        <PokeTraceSortDropdown
          ariaLabel="Sort set cards"
          className="set-category-grid__sort"
          includeChange
          onChange={handleSortChange}
          value={sort}
        />
      </div>
    </div>
  );

  const remainingCardCount = Math.max(sortedCards.length - visibleCount, 0);
  const nextCardCount = Math.min(
    POKETRACE_SEARCH_PAGE_SIZE,
    remainingCardCount,
  );
  const footer =
    remainingCardCount > 0 ? (
      <button
        className="set-category-grid__more"
        onClick={() =>
          setVisibleCount((current) =>
            Math.min(current + POKETRACE_SEARCH_PAGE_SIZE, sortedCards.length),
          )
        }
        type="button"
      >
        Show next {nextCardCount}
        <ChevronDown aria-hidden="true" />
      </button>
    ) : null;

  return (
    <section className="set-category-grid ui-render-fade">
      <header className="set-category-grid__explorer">
        <h1>Explore sets</h1>
      </header>

      <div className="set-category-grid__discovery">
        <div className="set-category-grid__filters">
          {setPicker}
          {eraSelector}
          {directorySortSelector}
        </div>

        <section
          aria-label="Browse sets"
          className="set-category-grid__set-directory"
        >
          {filteredSetOptions.length > 0 ? (
            <div className="set-category-grid__era-list">
              {groupedSetOptions.map(([era, options]) => (
                <SetDirectoryGroup
                  activeSetName={highlightedSetName}
                  disabled={loading}
                  era={era}
                  key={era}
                  onOpen={openSetFromDirectory}
                  options={options}
                />
              ))}
            </div>
          ) : (
            <p className="set-category-grid__directory-empty">
              No sets match the current filters.
            </p>
          )}
        </section>
      </div>

      {(loading || error || activeSetName) && (
        <div className="set-category-grid__results">
          {!loading && activeSetName && cards.length > 0 && (
            <SetExplorerOverview
              activeSetName={activeSetName}
              cardScope={cardScope}
              controls={resultControls}
              onCardScopeChange={handleCardScopeChange}
              overview={overview}
              updating={isScopePending}
            />
          )}

          <CardCategoryGrid
            collapsible={false}
            emptyMessage={
              activeSetName
                ? cardFilter.trim()
                  ? "No cards match this filter."
                  : `No cards were found in ${activeSetName}.`
                : null
            }
            error={error}
            footer={footer}
            items={visibleCards.map((card) => {
              const price = resolvePokeTraceCardPrice(card, DEFAULT_CONDITION);
              const conditionLabel =
                POKETRACE_RAW_CONDITION_LABELS[DEFAULT_CONDITION];
              return {
                card,
                marketDisplay: {
                  condition: DEFAULT_CONDITION,
                  currency: price?.currency ?? card.pokeTrace.currency,
                  price: price?.price,
                  priceLabel: `TCGplayer ${conditionLabel} market price`,
                  primaryText: price ? undefined : "—",
                  source: "tcgplayer",
                },
              };
            })}
            loading={loading}
            revealOnScroll
            sorting={isUpdatingResults}
          />
        </div>
      )}
    </section>
  );
}
