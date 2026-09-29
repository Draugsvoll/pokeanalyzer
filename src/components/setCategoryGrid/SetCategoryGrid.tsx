import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import { POKETRACE_SEARCH_PAGE_SIZE } from "../../../shared/pokeTraceSearch";
import type { PokeTraceSetSalesLeaders } from "../../../shared/pokeTraceSet";
import {
  POKETRACE_RAW_CONDITION_LABELS,
  type PokeTraceRawCondition,
} from "../../../shared/pokeTraceMarketConditions";
import { usePokeTraceSetNameOptions } from "../../hooks/usePokeTraceSetNameOptions";
import { isAbortError } from "../../hooks/useAbortableRequest";
import { loadPokeTraceSet } from "../../services/pokeTraceSets";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";
import { waitForUiPaint } from "../../utils/waitForUiPaint";
import {
  POKETRACE_DEFAULT_CARD_SORT,
  sortPokeTraceCards,
  type PokeTraceCardSort,
} from "../../utils/sortPokeTraceCards";
import {
  AutosuggestCombobox,
  type AutosuggestOption,
} from "../autosuggestCombobox/AutosuggestCombobox";
import { CardCategoryGrid } from "../cardCategoryGrid/CardCategoryGrid";
import { FilterInput } from "../filterInput/FilterInput";
import { PokeTraceSortDropdown } from "../pokeTraceSortDropdown/PokeTraceSortDropdown";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import { SetExplorerOverview } from "./SetExplorerOverview";
import {
  getSetDirectoryMetadata,
  type SetDirectoryMetadata,
} from "./setDirectoryMetadata";
import { buildSetExplorerOverview } from "./setExplorerMetrics";
import "./SetCategoryGrid.scss";

const INVALID_SET_MESSAGE =
  "Choose a set from the suggestions before opening it.";
const DEFAULT_CONDITION: PokeTraceRawCondition = "NEAR_MINT";
const OTHER_SET_ERA = "Other";

type SetDirectorySort = "newest" | "oldest";

const SET_DIRECTORY_SORT_OPTIONS: Array<{
  label: string;
  value: SetDirectorySort;
}> = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
];

type SetDirectoryOption = AutosuggestOption & SetDirectoryMetadata;

function enrichSetDirectoryOption(
  option: AutosuggestOption,
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
  sort: SetDirectorySort,
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
    eraOptions.sort((left, right) => compareSetReleaseYears(left, right, sort));
  }

  return [...optionsByEra.entries()].sort(
    ([leftEra, leftOptions], [rightEra, rightOptions]) => {
      if (leftEra === OTHER_SET_ERA) return 1;
      if (rightEra === OTHER_SET_ERA) return -1;

      const leftYear = leftOptions[0]?.releaseYear;
      const rightYear = rightOptions[0]?.releaseYear;
      if (leftYear == null && rightYear == null) {
        return leftEra.localeCompare(rightEra, "en-US", {
          sensitivity: "base",
        });
      }
      if (leftYear == null) return 1;
      if (rightYear == null) return -1;

      return (
        (sort === "newest" ? rightYear - leftYear : leftYear - rightYear) ||
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

  return (
    <button
      aria-current={active ? "true" : undefined}
      aria-label={`Open ${option.label}`}
      className={`set-category-grid__set-card${active ? " is-active" : ""}`}
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
    </button>
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
  const requestControllerRef = useRef<AbortController | null>(null);
  const cardFilterRef = useRef<HTMLInputElement>(null);
  const sortRequestIdRef = useRef(0);
  const [inputValue, setInputValue] = useState("");
  const [eraFilter, setEraFilter] = useState("");
  const [directorySort, setDirectorySort] =
    useState<SetDirectorySort>("newest");
  const [selectedSetName, setSelectedSetName] = useState<string | null>(null);
  const [activeSetName, setActiveSetName] = useState<string | null>(null);
  const [cards, setCards] = useState<PokemonCard[]>([]);
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

  const filteredCards = useMemo(
    () => cards.filter((card) => cardMatchesFilter(card, cardFilter)),
    [cardFilter, cards],
  );
  const sortedCards = useMemo(
    () =>
      sortPokeTraceCards(filteredCards, sort, {
        condition: DEFAULT_CONDITION,
      }),
    [filteredCards, sort],
  );
  const overview = useMemo(
    () => buildSetExplorerOverview(cards, salesLeaders),
    [cards, salesLeaders],
  );
  const visibleCards = sortedCards.slice(0, visibleCount);
  const normalizedSetFilter = inputValue.trim().toLocaleLowerCase("en-US");
  const setDirectoryOptions = useMemo(
    () => setNameOptions.map(enrichSetDirectoryOption),
    [setNameOptions],
  );
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

  async function openSet(setName: string) {
    requestControllerRef.current?.abort();
    sortRequestIdRef.current += 1;
    setIsSorting(false);
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setInvalid(false);
    setError(null);
    setLoading(true);

    try {
      const result = await loadPokeTraceSet(setName, controller.signal);
      if (controller.signal.aborted) return;
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
  }

  async function openSelectedSet() {
    if (!selectedSetName || inputValue !== selectedSetName) {
      setInvalid(true);
      return;
    }

    await openSet(selectedSetName);
  }

  function openSetFromDirectory(setName: string) {
    setInputValue(setName);
    setSelectedSetName(setName);
    setInvalid(false);
    void openSet(setName);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void openSelectedSet();
  }

  async function handleSortChange(nextSort: PokeTraceCardSort) {
    if (nextSort === sort || isSorting) return;
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
      className="set-category-grid__result-controls"
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
        ref={cardFilterRef}
        value={cardFilter}
      />
      <div className="set-category-grid__sort-control">
        <span>Sort</span>
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
                <section className="set-category-grid__era-group" key={era}>
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
                        disabled={loading}
                        key={option.value}
                        onOpen={openSetFromDirectory}
                        option={option}
                      />
                    ))}
                  </div>
                </section>
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
              controls={resultControls}
              onFilterCard={(card) => {
                setCardFilter(
                  [card.name, card.number].filter(Boolean).join(" "),
                );
                setVisibleCount(POKETRACE_SEARCH_PAGE_SIZE);
                cardFilterRef.current?.focus();
              }}
              overview={overview}
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
            revealOnScroll={false}
            sorting={isSorting}
          />
        </div>
      )}
    </section>
  );
}
