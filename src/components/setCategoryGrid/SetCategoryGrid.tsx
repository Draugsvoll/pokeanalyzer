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
import { AutosuggestCombobox } from "../autosuggestCombobox/AutosuggestCombobox";
import { CardCategoryGrid } from "../cardCategoryGrid/CardCategoryGrid";
import { FilterInput } from "../filterInput/FilterInput";
import { PokeTraceSortDropdown } from "../pokeTraceSortDropdown/PokeTraceSortDropdown";
import { SetExplorerOverview } from "./SetExplorerOverview";
import { buildSetExplorerOverview } from "./setExplorerMetrics";
import "./SetCategoryGrid.scss";

const INVALID_SET_MESSAGE =
  "Choose a set from the suggestions before opening it.";
const DEFAULT_CONDITION: PokeTraceRawCondition = "NEAR_MINT";

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
  const filteredSetOptions = useMemo(
    () =>
      setNameOptions.filter(
        (option) =>
          !normalizedSetFilter ||
          option.label.toLocaleLowerCase("en-US").includes(normalizedSetFilter),
      ),
    [normalizedSetFilter, setNameOptions],
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
        onClear={() => {
          cancelPendingRequest();
          setInputValue("");
          setSelectedSetName(null);
          setInvalid(false);
        }}
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
        placeholder="Filter"
        value={inputValue}
      />
      <span className="set-category-grid__visually-hidden" id={validationId}>
        {INVALID_SET_MESSAGE}
      </span>
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
        <h1>Explore a set</h1>
      </header>

      <div className="set-category-grid__discovery">
        {setPicker}

        <section
          aria-label="Browse sets"
          className="set-category-grid__set-directory"
        >
          <header className="set-category-grid__directory-header">
            <h2>Browse sets</h2>
            <span>
              {filteredSetOptions.length.toLocaleString("en-US")}{" "}
              {filteredSetOptions.length === 1 ? "set" : "sets"}
            </span>
          </header>
          {filteredSetOptions.length > 0 ? (
            <div className="set-category-grid__set-list">
              {filteredSetOptions.map((option) => {
                const isActive = activeSetName === option.value;
                return (
                  <button
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`Open ${option.label}`}
                    className={`set-category-grid__set-card${
                      isActive ? " is-active" : ""
                    }`}
                    disabled={loading}
                    key={option.value}
                    onClick={() => openSetFromDirectory(option.value)}
                    type="button"
                  >
                    <span title={option.label}>{option.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="set-category-grid__directory-empty">
              No sets match “{inputValue.trim()}”.
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
