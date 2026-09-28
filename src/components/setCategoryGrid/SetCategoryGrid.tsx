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
import { usePokeTraceSetNameOptions } from "../../hooks/usePokeTraceSetNameOptions";
import { isAbortError } from "../../hooks/useAbortableRequest";
import { loadPokeTraceSetCards } from "../../services/pokeTraceSets";
import type { PokemonCard } from "../../types/pokemon";
import { logClientError } from "../../utils/logClientError";
import { waitForUiPaint } from "../../utils/waitForUiPaint";
import {
  POKETRACE_DEFAULT_CARD_SORT,
  sortPokeTraceCards,
  type PokeTraceCardSort,
} from "../../utils/sortPokeTraceCards";
import { AutosuggestCombobox } from "../autosuggestCombobox/AutosuggestCombobox";
import Button from "../button/Button";
import { CardCategoryGrid } from "../cardCategoryGrid/CardCategoryGrid";
import { PokeTraceSortDropdown } from "../pokeTraceSortDropdown/PokeTraceSortDropdown";
import { ResultGridCloseButton } from "../resultGridCloseButton/ResultGridCloseButton";
import "./SetCategoryGrid.scss";

const INVALID_SET_MESSAGE =
  "Choose a set from the suggestions before opening it.";

export function SetCategoryGrid() {
  const validationId = useId();
  const setNameOptions = usePokeTraceSetNameOptions();
  const requestControllerRef = useRef<AbortController | null>(null);
  const sortRequestIdRef = useRef(0);
  const [inputValue, setInputValue] = useState("");
  const [selectedSetName, setSelectedSetName] = useState<string | null>(null);
  const [activeSetName, setActiveSetName] = useState<string | null>(null);
  const [cards, setCards] = useState<PokemonCard[]>([]);
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

  const sortedCards = useMemo(
    () => sortPokeTraceCards(cards, sort),
    [cards, sort],
  );
  const visibleCards = sortedCards.slice(0, visibleCount);

  async function openSelectedSet() {
    if (!selectedSetName || inputValue !== selectedSetName) {
      setInvalid(true);
      return;
    }

    requestControllerRef.current?.abort();
    sortRequestIdRef.current += 1;
    setIsSorting(false);
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setInvalid(false);
    setError(null);
    setLoading(true);

    try {
      const nextCards = await loadPokeTraceSetCards(
        selectedSetName,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setCards(nextCards);
      setActiveSetName(selectedSetName);
      setSort(POKETRACE_DEFAULT_CARD_SORT);
      setVisibleCount(POKETRACE_SEARCH_PAGE_SIZE);
    } catch (requestError) {
      if (controller.signal.aborted || isAbortError(requestError)) return;
      logClientError("Failed to open PokeTrace set", requestError);
      setCards([]);
      setActiveSetName(null);
      setError("This set is temporarily unavailable. Please try again.");
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
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

  function closeResults() {
    cancelPendingRequest();
    setCards([]);
    setActiveSetName(null);
    setError(null);
    setSort(POKETRACE_DEFAULT_CARD_SORT);
    setVisibleCount(POKETRACE_SEARCH_PAGE_SIZE);
  }

  const controls = (
    <div className="set-category-grid__controls">
      <div className="set-category-grid__picker">
        <AutosuggestCombobox
          ariaLabel="Set name"
          className={`set-category-grid__combobox${invalid ? " is-invalid" : ""}`}
          inputAriaDescribedBy={invalid ? validationId : undefined}
          inputAriaInvalid={invalid}
          menuLabel="Set name suggestions"
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
          placeholder="Choose a set"
          value={inputValue}
        />
        <Button
          aria-busy={loading || undefined}
          aria-label={loading ? "Opening set" : undefined}
          disabled={loading}
          fill="ghost"
          onClick={() => void openSelectedSet()}
          size="large"
        >
          {loading ? (
            <span aria-hidden="true" className="app-btn__spinner" />
          ) : (
            "Open"
          )}
        </Button>
        <span className="set-category-grid__visually-hidden" id={validationId}>
          {INVALID_SET_MESSAGE}
        </span>
      </div>

      {!loading && activeSetName && cards.length > 0 && (
        <div className="set-category-grid__toolbar">
          <p>
            {activeSetName} - {cards.length.toLocaleString("en-US")} card
            {cards.length === 1 ? "" : "s"}
          </p>
          <div className="set-category-grid__toolbar-actions">
            <PokeTraceSortDropdown
              ariaLabel="Sort set cards"
              className="set-category-grid__sort"
              onChange={handleSortChange}
              value={sort}
            />
            <ResultGridCloseButton
              ariaLabel="Close set results"
              onClick={closeResults}
            />
          </div>
        </div>
      )}
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
    <CardCategoryGrid
      controls={controls}
      defaultCollapsed
      emptyMessage={
        activeSetName ? `No cards were found in ${activeSetName}.` : null
      }
      error={error}
      footer={footer}
      items={visibleCards.map((card) => ({ card }))}
      loading={loading}
      revealOnScroll={false}
      sorting={isSorting}
      title="Explore a Set"
    />
  );
}
