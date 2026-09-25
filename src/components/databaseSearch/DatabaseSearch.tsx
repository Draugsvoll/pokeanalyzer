import React, { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";
import "./DatabaseSearch.scss";
import { logClientError } from "../../utils/logClientError";
import { GridView } from "../gridView/GridView";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";
import { SearchHero } from "../searchHero/SearchHero";
import {
  loadPokeTraceCatalogRarities,
  searchCachedPokeTraceCatalog,
  searchInitializedPokeTraceCatalog,
  type PokeTraceCatalogSearch,
} from "../../services/pokeTraceCatalog";
import { SearchResultsToolbar } from "./SearchResultsToolbar";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import {
  POKETRACE_RAW_CONDITIONS,
  POKETRACE_RAW_CONDITION_LABELS,
  type PokeTraceRawCondition,
} from "../../../shared/pokeTraceMarketConditions";
import {
  POKETRACE_DEFAULT_SEARCH_SORT,
  POKETRACE_SEARCH_PAGE_SIZE,
  type PokeTraceSearchPage,
  type PokeTraceSearchSort,
} from "../../../shared/pokeTraceSearch";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type DatabaseSearchProps = {
  autoFocusName?: boolean;
  /** Compact results/wrapper layout for inside another view. Search bar stays shared. */
  embedded?: boolean;
  onClose?: () => void;
};

type DatabaseSearchFilters = {
  condition: PokeTraceRawCondition | "";
  maxPrice: string;
  minPrice: string;
  rarity: string;
};

type SearchFeedback = {
  kind: "empty" | "error";
  message: string;
};

type PriceFilterValidation = {
  field: "max" | "min";
  message: string;
};

type ActiveServerSearch = {
  nextOffset: number | null;
  query: string;
};

function waitForLoadingStatePaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

const EMPTY_SEARCH_FILTERS: DatabaseSearchFilters = {
  condition: "",
  maxPrice: "",
  minPrice: "",
  rarity: "",
};

const FALLBACK_SEARCH_RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Promo",
  "Holo Rare",
  "Ultra Rare",
  "Secret Rare",
  "Double Rare",
  "Illustration Rare",
  "Shiny Holo Rare",
  "Special Illustration Rare",
  "Classic Collection",
  "Shiny Rare",
  "Hyper Rare",
  "ACE SPEC Rare",
  "Radiant Rare",
  "Rainbow Rare",
  "Prism Rare",
  "Pikachu Rare",
  "Rare BREAK",
  "Super Rare",
  "Rare Ace",
  "Shiny Ultra Rare",
  "Futuristic Rare",
  "Amazing Rare",
  "Mega Hyper Rare",
  "Mega Attack Rare",
  "Black White Rare",
];

const FALLBACK_RARITY_OPTIONS = [
  { value: "", label: "Any" },
  ...FALLBACK_SEARCH_RARITIES.map((rarity) => ({
    label: rarity,
    value: rarity,
  })),
];

const CONDITION_OPTIONS = [
  { value: "" as const, label: "Any" },
  ...POKETRACE_RAW_CONDITIONS.map((condition) => ({
    value: condition,
    label: POKETRACE_RAW_CONDITION_LABELS[condition],
  })),
];

function optionalPrice(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function validatePriceFilters(
  filters: DatabaseSearchFilters,
): PriceFilterValidation | null {
  const minPrice = optionalPrice(filters.minPrice);
  const maxPrice = optionalPrice(filters.maxPrice);
  if (filters.minPrice && minPrice === undefined) {
    return { field: "min", message: "Enter a valid minimum price." };
  }
  if (filters.maxPrice && maxPrice === undefined) {
    return { field: "max", message: "Enter a valid maximum price." };
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return {
      field: "max",
      message: "Maximum price cannot be lower than minimum price.",
    };
  }
  return null;
}

function activeFilterCount(filters: DatabaseSearchFilters) {
  return [
    Boolean(filters.condition),
    Boolean(filters.minPrice.trim()),
    Boolean(filters.maxPrice.trim()),
    Boolean(filters.rarity),
  ].filter(Boolean).length;
}

async function fetchSearchPage(
  query: string,
  offset: number,
  sort: PokeTraceSearchSort,
): Promise<PokeTraceSearchPage<PokemonCardType>> {
  const params = new URLSearchParams(query);
  params.set("offset", String(offset));
  params.set("sort", sort);
  const response = await fetch(
    `${API_URL}/api/cards/search?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }

  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Search returned an invalid response");
  }
  const page = value as Partial<PokeTraceSearchPage<PokemonCardType>>;
  if (
    !Array.isArray(page.items) ||
    (page.total !== null &&
      (!Number.isSafeInteger(page.total) || Number(page.total) < 0)) ||
    typeof page.hasMore !== "boolean" ||
    (page.nextOffset !== null && !Number.isSafeInteger(page.nextOffset))
  ) {
    throw new Error("Search returned an invalid response");
  }

  return page as PokeTraceSearchPage<PokemonCardType>;
}

type DatabaseSearchBarProps = {
  autoFocusName: boolean;
  canSearch: boolean;
  cardNumber: string;
  filters: DatabaseSearchFilters;
  priceFilterValidation: PriceFilterValidation | null;
  isSearching: boolean;
  onCardNumberChange: (value: string) => void;
  onPokemonNameChange: (value: string) => void;
  onFiltersChange: (updates: Partial<DatabaseSearchFilters>) => void;
  onFiltersClear: () => void;
  onSearch: () => void;
  onSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSetNameChange: (value: string) => void;
  pokemonName: string;
  setName: string;
};

export function DatabaseSearchBar({
  autoFocusName,
  canSearch,
  cardNumber,
  filters,
  isSearching,
  onCardNumberChange,
  onPokemonNameChange,
  onFiltersChange,
  onFiltersClear,
  onSearch,
  onSearchKeyDown,
  onSetNameChange,
  pokemonName,
  priceFilterValidation,
  setName,
}: DatabaseSearchBarProps) {
  const filterPanelId = useId();
  const priceValidationId = `${filterPanelId}-price-validation`;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rarityOptions, setRarityOptions] = useState(FALLBACK_RARITY_OPTIONS);
  const filterCount = activeFilterCount(filters);
  const hasSearchCriteria = Boolean(
    pokemonName.trim() || setName.trim() || cardNumber.trim() || filterCount,
  );
  const searchButtonDisabled =
    isSearching || !canSearch || !hasSearchCriteria || !!priceFilterValidation;
  const pokemonNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusName) return;
    pokemonNameInputRef.current?.focus({ preventScroll: true });
  }, [autoFocusName]);

  useEffect(() => {
    let active = true;
    void loadPokeTraceCatalogRarities().then((rarities) => {
      if (!active || !rarities?.length) return;
      setRarityOptions([
        { value: "", label: "Any" },
        ...rarities.map((rarity) => ({ label: rarity, value: rarity })),
      ]);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="database-search-control">
      <div className="database-search-bar">
        <div
          className="database-search-fields"
          role="group"
          aria-label="Search fields"
        >
          <label className="explore-search-field">
            <Search
              className="explore-search-field__icon"
              size={16}
              strokeWidth={2}
              absoluteStrokeWidth
              aria-hidden="true"
            />
            <input
              ref={pokemonNameInputRef}
              className="database-search"
              value={pokemonName}
              onChange={(event) => onPokemonNameChange(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Name"
              aria-label="Pokemon name"
            />
          </label>
          <span className="explore-search-shell__divider" aria-hidden="true" />
          <label className="explore-search-field">
            <input
              className="database-search database-search--number"
              value={cardNumber}
              onChange={(event) => onCardNumberChange(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="No."
              aria-label="Card number"
            />
          </label>
          <span className="explore-search-shell__divider" aria-hidden="true" />
          <label className="explore-search-field">
            <input
              className="database-search"
              value={setName}
              onChange={(event) => onSetNameChange(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Set"
              aria-label="Set name"
            />
          </label>
        </div>
        <div className="database-search-actions">
          <button
            type="button"
            className="explore-search-shell__submit"
            onClick={onSearch}
            onMouseDown={(event) => event.preventDefault()}
            disabled={searchButtonDisabled}
            aria-busy={isSearching || undefined}
          >
            {isSearching ? (
              <span
                className="database-search-spinner"
                aria-label="Searching"
              />
            ) : (
              "Search"
            )}
          </button>
        </div>
      </div>

      <div
        className={`database-search-filter-toolbar${filtersOpen ? " is-open" : ""}`}
      >
        <div className="database-search-filter-actions">
          <button
            type="button"
            className={`database-search-filter-toggle${filtersOpen ? " is-open" : ""}`}
            aria-controls={filterPanelId}
            aria-expanded={filtersOpen}
            aria-label="Search filters"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal aria-hidden="true" />
            <span>Filters</span>
            {filterCount > 0 && (
              <span className="database-search-filter-toggle__count">
                {filterCount}
              </span>
            )}
          </button>

          {filtersOpen && (
            <button
              aria-label="Clear all"
              type="button"
              className="database-search-filters__clear"
              disabled={filterCount === 0}
              onClick={onFiltersClear}
            >
              <RotateCcw aria-hidden="true" />
              <span>Clear all</span>
            </button>
          )}
        </div>

        {filtersOpen && (
          <div
            className="database-search-filters ui-render-fade"
            id={filterPanelId}
            role="group"
            aria-label="Optional search filters"
          >
            <div className="database-search-filters__grid">
              <label className="database-search-filter-field">
                <span>Min</span>
                <span
                  className={`database-search-price-input${priceFilterValidation?.field === "min" ? " is-invalid" : ""}`}
                >
                  <span aria-hidden="true">$</span>
                  <input
                    aria-describedby={
                      priceFilterValidation?.field === "min"
                        ? priceValidationId
                        : undefined
                    }
                    aria-label="Minimum price"
                    aria-invalid={
                      priceFilterValidation?.field === "min" || undefined
                    }
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      onFiltersChange({ minPrice: event.target.value })
                    }
                    onKeyDown={onSearchKeyDown}
                    placeholder="0"
                    step="0.01"
                    type="number"
                    value={filters.minPrice}
                  />
                </span>
              </label>

              <label className="database-search-filter-field">
                <span>Max</span>
                <span
                  className={`database-search-price-input${priceFilterValidation?.field === "max" ? " is-invalid" : ""}`}
                >
                  <span aria-hidden="true">$</span>
                  <input
                    aria-describedby={
                      priceFilterValidation?.field === "max"
                        ? priceValidationId
                        : undefined
                    }
                    aria-label="Maximum price"
                    aria-invalid={
                      priceFilterValidation?.field === "max" || undefined
                    }
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      onFiltersChange({ maxPrice: event.target.value })
                    }
                    onKeyDown={onSearchKeyDown}
                    placeholder="0"
                    step="0.01"
                    type="number"
                    value={filters.maxPrice}
                  />
                </span>
              </label>

              <div className="database-search-filter-field">
                <span>Rarity</span>
                <SelectDropdown
                  ariaLabel="Filter by rarity"
                  className="database-search-rarity-select"
                  onChange={(rarity) => onFiltersChange({ rarity })}
                  options={rarityOptions}
                  value={filters.rarity}
                />
              </div>

              <div className="database-search-filter-field">
                <span>Condition</span>
                <SelectDropdown
                  ariaLabel="Filter by condition"
                  className="database-search-condition-select"
                  onChange={(condition) => onFiltersChange({ condition })}
                  options={CONDITION_OPTIONS}
                  value={filters.condition}
                />
              </div>
              {priceFilterValidation && (
                <span
                  className="database-search-visually-hidden"
                  id={priceValidationId}
                >
                  {priceFilterValidation.message}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const DatabaseSearch: React.FC<DatabaseSearchProps> = ({
  autoFocusName = false,
  embedded = false,
  onClose,
}) => {
  const [pokemonName, setPokemonName] = useState("");
  const [setName, setSetName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [filters, setFilters] =
    useState<DatabaseSearchFilters>(EMPTY_SEARCH_FILTERS);
  const [results, setResults] = useState<PokemonCardType[]>([]);
  const [totalResultCount, setTotalResultCount] = useState(0);
  const [activeServerSearch, setActiveServerSearch] =
    useState<ActiveServerSearch | null>(null);
  const [activeLocalSearch, setActiveLocalSearch] =
    useState<PokeTraceCatalogSearch | null>(null);
  const [activeCondition, setActiveCondition] = useState<
    PokeTraceRawCondition | ""
  >("");
  const [visibleResultCount, setVisibleResultCount] = useState(
    POKETRACE_SEARCH_PAGE_SIZE,
  );
  const [resultRenderKey, setResultRenderKey] = useState(0);
  const searchRequestIdRef = useRef(0);
  const searchCooldownTimerRef = useRef<number | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [canSearch, setCanSearch] = useState(true);
  const [sortDirection, setSortDirection] = useState<PokeTraceSearchSort>(
    POKETRACE_DEFAULT_SEARCH_SORT,
  );
  const [activeQueryLabel, setActiveQueryLabel] = useState("");
  const [searchFeedback, setSearchFeedback] = useState<SearchFeedback | null>(
    null,
  );
  const priceFilterValidation = validatePriceFilters(filters);
  useEffect(() => {
    return () => {
      searchRequestIdRef.current += 1;
      window.clearTimeout(searchCooldownTimerRef.current);
    };
  }, []);
  const visibleResults = activeServerSearch
    ? results
    : results.slice(0, visibleResultCount);

  async function handleSearch() {
    if (!canSearch || isSearching || isLoadingMore) return;

    const trimmedPokemonName = pokemonName.trim();
    const trimmedSetName = setName.trim();
    const trimmedCardNumber = cardNumber.trim();
    const minPrice = optionalPrice(filters.minPrice);
    const maxPrice = optionalPrice(filters.maxPrice);
    const rarity = filters.rarity.trim();
    const condition = filters.condition;

    if (
      !trimmedPokemonName &&
      !trimmedSetName &&
      !trimmedCardNumber &&
      minPrice === undefined &&
      maxPrice === undefined &&
      !rarity &&
      !condition
    ) {
      setResults([]);
      setTotalResultCount(0);
      setActiveServerSearch(null);
      setActiveLocalSearch(null);
      setActiveQueryLabel("");
      setActiveCondition("");
      setSearchFeedback(null);
      return;
    }
    if (priceFilterValidation) return;

    setIsSearching(true);
    setCanSearch(false);
    setSearchFeedback(null);
    const requestId = ++searchRequestIdRef.current;
    await waitForLoadingStatePaint();
    if (requestId !== searchRequestIdRef.current) return;

    try {
      const params = new URLSearchParams();
      if (trimmedPokemonName) params.set("pokemonName", trimmedPokemonName);
      if (trimmedSetName) params.set("setName", trimmedSetName);
      if (trimmedCardNumber) params.set("cardNumber", trimmedCardNumber);
      if (minPrice !== undefined) params.set("minPrice", String(minPrice));
      if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));
      if (rarity) params.set("rarity", rarity);
      const serverQuery = params.toString();

      const catalogSearch = {
        pokemonName: trimmedPokemonName,
        setName: trimmedSetName,
        cardNumber: trimmedCardNumber,
        minPrice,
        maxPrice,
        rarity,
        sort: sortDirection,
        ...(condition && { condition }),
      };
      const localResults = condition
        ? await searchInitializedPokeTraceCatalog(catalogSearch)
        : searchCachedPokeTraceCatalog(catalogSearch);
      if (requestId !== searchRequestIdRef.current) return;
      if (condition && localResults === null) {
        setResults([]);
        setTotalResultCount(0);
        setActiveServerSearch(null);
        setActiveLocalSearch(null);
        setActiveQueryLabel("");
        setActiveCondition("");
        setSearchFeedback({
          kind: "error",
          message: "Condition search is temporarily unavailable.",
        });
        return;
      }
      const serverPage =
        localResults !== null
          ? null
          : await fetchSearchPage(serverQuery, 0, sortDirection);
      if (requestId !== searchRequestIdRef.current) return;
      const data = localResults ?? serverPage?.items ?? [];

      setResults(data);
      setTotalResultCount(
        localResults !== null ? data.length : (serverPage?.total ?? 0),
      );
      setActiveServerSearch(
        serverPage
          ? { nextOffset: serverPage.nextOffset, query: serverQuery }
          : null,
      );
      setActiveLocalSearch(localResults !== null ? catalogSearch : null);
      setActiveCondition(condition);
      setVisibleResultCount(POKETRACE_SEARCH_PAGE_SIZE);
      setSearchFeedback(
        data.length === 0
          ? { kind: "empty", message: "No cards found." }
          : null,
      );
      setActiveQueryLabel(
        [
          trimmedPokemonName,
          trimmedCardNumber && `#${trimmedCardNumber}`,
          trimmedSetName,
          rarity,
          condition ? POKETRACE_RAW_CONDITION_LABELS[condition] : "",
          minPrice !== undefined && maxPrice !== undefined
            ? `$${minPrice}–$${maxPrice}`
            : minPrice !== undefined
              ? `$${minPrice}+`
              : maxPrice !== undefined
                ? `Up to $${maxPrice}`
                : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      setResultRenderKey((currentKey) => currentKey + 1);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;
      logClientError("Search failed", error);
      setResults([]);
      setTotalResultCount(0);
      setActiveServerSearch(null);
      setActiveLocalSearch(null);
      setActiveQueryLabel("");
      setActiveCondition("");
      setSearchFeedback({
        kind: "error",
        message: "Search is temporarily unavailable. Please try again.",
      });
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);

        window.clearTimeout(searchCooldownTimerRef.current);
        searchCooldownTimerRef.current = window.setTimeout(() => {
          setCanSearch(true);
        }, 1000);
      }
    }
  }

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      submitSearch();
    }
  };

  function submitSearch() {
    if (!canSearch || isSearching || isLoadingMore) return;

    handleSearch();
  }

  async function handleSortChange(nextSort: PokeTraceSearchSort) {
    if (nextSort === sortDirection || isSearching || isLoadingMore) return;
    const previousSort = sortDirection;
    setSortDirection(nextSort);
    if (activeLocalSearch) {
      const localResults = searchCachedPokeTraceCatalog({
        ...activeLocalSearch,
        sort: nextSort,
      });
      if (localResults === null) {
        setSortDirection(previousSort);
        setSearchFeedback({
          kind: "error",
          message: "The local card catalog is temporarily unavailable.",
        });
        return;
      }
      setResults(localResults);
      setTotalResultCount(localResults.length);
      setActiveLocalSearch({ ...activeLocalSearch, sort: nextSort });
      setVisibleResultCount(POKETRACE_SEARCH_PAGE_SIZE);
      setResultRenderKey((currentKey) => currentKey + 1);
      return;
    }
    if (!activeServerSearch) return;

    setIsSearching(true);
    setSearchFeedback(null);
    const requestId = ++searchRequestIdRef.current;
    try {
      const page = await fetchSearchPage(activeServerSearch.query, 0, nextSort);
      if (requestId !== searchRequestIdRef.current) return;
      setResults(page.items);
      setTotalResultCount(page.total ?? 0);
      setActiveServerSearch({
        nextOffset: page.nextOffset,
        query: activeServerSearch.query,
      });
      setResultRenderKey((currentKey) => currentKey + 1);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;
      logClientError("Search sorting failed", error);
      setSortDirection(previousSort);
      setSearchFeedback({
        kind: "error",
        message: "Could not sort the results. Please try again.",
      });
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  }

  async function handleShowNext() {
    if (!activeServerSearch) {
      setVisibleResultCount((current) => current + POKETRACE_SEARCH_PAGE_SIZE);
      return;
    }
    if (
      activeServerSearch.nextOffset === null ||
      isLoadingMore ||
      isSearching
    ) {
      return;
    }

    setIsLoadingMore(true);
    setSearchFeedback(null);
    const requestId = ++searchRequestIdRef.current;
    try {
      const page = await fetchSearchPage(
        activeServerSearch.query,
        activeServerSearch.nextOffset,
        sortDirection,
      );
      if (requestId !== searchRequestIdRef.current) return;
      setResults((current) => [...current, ...page.items]);
      if (page.total !== null) {
        setTotalResultCount(page.total);
      }
      setActiveServerSearch({
        nextOffset: page.nextOffset,
        query: activeServerSearch.query,
      });
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;
      logClientError("Loading more search results failed", error);
      setSearchFeedback({
        kind: "error",
        message: "Could not load more cards. Please try again.",
      });
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsLoadingMore(false);
      }
    }
  }

  const searchBar = (
    <DatabaseSearchBar
      autoFocusName={autoFocusName}
      canSearch={canSearch && !isLoadingMore}
      cardNumber={cardNumber}
      filters={filters}
      isSearching={isSearching}
      onCardNumberChange={setCardNumber}
      onFiltersChange={(updates) =>
        setFilters((current) => ({ ...current, ...updates }))
      }
      onFiltersClear={() => setFilters(EMPTY_SEARCH_FILTERS)}
      onPokemonNameChange={setPokemonName}
      onSearch={submitSearch}
      onSearchKeyDown={handleSearchKeyDown}
      onSetNameChange={setSetName}
      pokemonName={pokemonName}
      priceFilterValidation={priceFilterValidation}
      setName={setName}
    />
  );

  return (
    <section
      className={`database-preview explore-page${embedded ? " database-preview--embedded" : ""}`}
      id="database-search"
    >
      <div className={embedded ? undefined : "explore-page__inner"}>
        {embedded ? searchBar : <SearchHero>{searchBar}</SearchHero>}
        {searchFeedback && !isSearching && (
          <p
            className={`database-search-feedback database-search-feedback--${searchFeedback.kind}`}
            role={searchFeedback.kind === "error" ? "alert" : "status"}
          >
            {searchFeedback.message}
          </p>
        )}
        {(() => {
          if (results.length === 0) return null;

          /* Embedded (card switch) uses the same grid cards as /search */
          const resultsNode = (
            <div
              className="search-results search-results--grid ui-card-grid-enter ui-render-fade"
              key={resultRenderKey}
            >
              <SearchResultsToolbar
                activeQueryLabel={activeQueryLabel}
                onClose={() => {
                  searchRequestIdRef.current += 1;
                  window.clearTimeout(searchCooldownTimerRef.current);
                  setIsSearching(false);
                  setIsLoadingMore(false);
                  setCanSearch(true);
                  setResults([]);
                  setTotalResultCount(0);
                  setActiveServerSearch(null);
                  setActiveLocalSearch(null);
                  setActiveQueryLabel("");
                  setActiveCondition("");
                  setSearchFeedback(null);
                  onClose?.();
                }}
                onSortChange={handleSortChange}
                resultCount={totalResultCount}
                sortDirection={sortDirection}
              />
              {results.length > 0 && (
                <GridView>
                  {visibleResults.map((card) => {
                    const selectedPrice = activeCondition
                      ? resolvePokeTraceCardPrice(card, activeCondition)?.price
                      : undefined;
                    const conditionLabel = activeCondition
                      ? POKETRACE_RAW_CONDITION_LABELS[activeCondition]
                      : "";

                    return (
                      <PokemonCardView
                        key={card.id}
                        card={card}
                        marketDisplay={
                          activeCondition
                            ? {
                                currency: card.pokeTrace.currency,
                                marketLabel: conditionLabel,
                                price: selectedPrice,
                                priceLabel: `TCGPlayer · ${conditionLabel}`,
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </GridView>
              )}
              {(activeServerSearch
                ? activeServerSearch.nextOffset !== null
                : visibleResultCount < results.length) && (
                <div className="search-results__more">
                  <button
                    className="search-results__more-button"
                    disabled={isLoadingMore || isSearching}
                    onClick={handleShowNext}
                    type="button"
                  >
                    {isLoadingMore ? "Loading…" : "Show next 50"}
                    <ChevronDown aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          );

          return resultsNode;
        })()}
      </div>
    </section>
  );
};
