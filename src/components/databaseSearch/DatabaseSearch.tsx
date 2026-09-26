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
  loadPokeTraceCatalogSetNames,
  searchCachedPokeTraceCatalog,
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
  type PokeTraceSearchResponse,
  type PokeTraceSearchSort,
} from "../../../shared/pokeTraceSearch";
import { AutosuggestCombobox } from "../autosuggestCombobox/AutosuggestCombobox";

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

type ActiveSearchQuery = {
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
const GENERIC_SEARCH_ERROR_MESSAGE =
  "Something went wrong. Please try again later.";

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

async function fetchServerSearch(
  query: string,
  sort: PokeTraceSearchSort,
): Promise<PokeTraceSearchResponse<PokemonCardType>> {
  const params = new URLSearchParams(query);
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
  const result = value as Partial<PokeTraceSearchResponse<PokemonCardType>>;
  if (
    !Array.isArray(result.items) ||
    !Number.isSafeInteger(result.total) ||
    Number(result.total) < 0
  ) {
    throw new Error("Search returned an invalid response");
  }

  return result as PokeTraceSearchResponse<PokemonCardType>;
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
  onSetNameChange: (value: string, exact: boolean) => void;
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
  const [setNameOptions, setSetNameOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
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

  useEffect(() => {
    let active = true;
    void loadPokeTraceCatalogSetNames().then((setNames) => {
      if (!active || !setNames?.length) return;
      setSetNameOptions(
        setNames.map((setName) => ({ label: setName, value: setName })),
      );
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
              absoluteStrokeWidth
              aria-hidden="true"
              className="explore-search-field__icon"
              size={16}
              strokeWidth={2}
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
            <AutosuggestCombobox
              ariaLabel="Set name"
              className="database-search-set-combobox"
              inputClassName="database-search"
              menuLabel="Set name suggestions"
              onInputChange={(value) => onSetNameChange(value, false)}
              onKeyDown={onSearchKeyDown}
              onSelect={(value) => onSetNameChange(value, true)}
              options={setNameOptions}
              placeholder="Set"
              value={setName}
            />
          </label>
        </div>
        <div className="database-search-actions">
          <div className="database-search-filter-entry">
            <button
              aria-controls={filterPanelId}
              aria-expanded={filtersOpen}
              aria-label={
                filterCount > 0
                  ? `Search filters, ${filterCount} active`
                  : "Search filters"
              }
              className={`database-search-filter-toggle${filtersOpen ? " is-open" : ""}`}
              onClick={() => setFiltersOpen((current) => !current)}
              type="button"
            >
              <span className="database-search-filter-toggle__icon">
                <SlidersHorizontal aria-hidden="true" />
                {filterCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="database-search-filter-toggle__count"
                  >
                    {filterCount}
                  </span>
                )}
              </span>
              <span>Filter</span>
            </button>
          </div>

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

      {filtersOpen && (
        <div className="database-search-filter-toolbar">
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
                <AutosuggestCombobox
                  ariaLabel="Filter by rarity"
                  className="database-search-rarity-combobox"
                  menuLabel="Rarity suggestions"
                  onInputChange={(rarity) => onFiltersChange({ rarity })}
                  onKeyDown={onSearchKeyDown}
                  onSelect={(rarity) => onFiltersChange({ rarity })}
                  options={rarityOptions}
                  placeholder="Any"
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

          <div className="database-search-filter-actions">
            <button
              aria-label="Clear all"
              className="database-search-filters__clear"
              disabled={filterCount === 0}
              onClick={onFiltersClear}
              type="button"
            >
              <RotateCcw aria-hidden="true" />
              <span>Clear all</span>
            </button>
          </div>
        </div>
      )}
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
  const [setNameExact, setSetNameExact] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [filters, setFilters] =
    useState<DatabaseSearchFilters>(EMPTY_SEARCH_FILTERS);
  const [results, setResults] = useState<PokemonCardType[]>([]);
  const [totalResultCount, setTotalResultCount] = useState(0);
  const [activeSearchQuery, setActiveSearchQuery] =
    useState<ActiveSearchQuery | null>(null);
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
  const visibleResults = results.slice(0, visibleResultCount);

  async function handleSearch() {
    if (!canSearch || isSearching) return;

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
      setActiveSearchQuery(null);
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
      if (trimmedSetName && setNameExact) params.set("setNameExact", "true");
      if (trimmedCardNumber) params.set("cardNumber", trimmedCardNumber);
      if (minPrice !== undefined) params.set("minPrice", String(minPrice));
      if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));
      if (rarity) params.set("rarity", rarity);
      if (condition) params.set("condition", condition);
      const serverQuery = params.toString();

      const catalogSearch = {
        pokemonName: trimmedPokemonName,
        setName: trimmedSetName,
        cardNumber: trimmedCardNumber,
        minPrice,
        maxPrice,
        rarity,
        sort: sortDirection,
        ...(setNameExact && { setNameExact: true }),
        ...(condition && { condition }),
      };
      const localResults = await searchCachedPokeTraceCatalog(catalogSearch);
      if (requestId !== searchRequestIdRef.current) return;
      const serverResponse =
        localResults !== null
          ? null
          : await fetchServerSearch(serverQuery, sortDirection);
      if (requestId !== searchRequestIdRef.current) return;
      const data = localResults ?? serverResponse?.items ?? [];

      setResults(data);
      setTotalResultCount(
        localResults !== null ? data.length : (serverResponse?.total ?? 0),
      );
      setActiveSearchQuery({ query: serverQuery });
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
      setActiveSearchQuery(null);
      setActiveLocalSearch(null);
      setActiveQueryLabel("");
      setActiveCondition("");
      setSearchFeedback({
        kind: "error",
        message: GENERIC_SEARCH_ERROR_MESSAGE,
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
    if (!canSearch || isSearching) return;

    handleSearch();
  }

  async function handleSortChange(nextSort: PokeTraceSearchSort) {
    if (nextSort === sortDirection || isSearching) return;
    const previousSort = sortDirection;
    setSortDirection(nextSort);
    if (activeLocalSearch) {
      const nextSearch = {
        ...activeLocalSearch,
        sort: nextSort,
      };
      const requestId = ++searchRequestIdRef.current;
      const cachedResults = await searchCachedPokeTraceCatalog(nextSearch);
      if (requestId !== searchRequestIdRef.current) return;
      if (cachedResults !== null) {
        setResults(cachedResults);
        setTotalResultCount(cachedResults.length);
        setActiveLocalSearch(nextSearch);
        setVisibleResultCount(POKETRACE_SEARCH_PAGE_SIZE);
        setSearchFeedback(
          cachedResults.length === 0
            ? { kind: "empty", message: "No cards found." }
            : null,
        );
        setResultRenderKey((currentKey) => currentKey + 1);
        return;
      }

      // Once this result set falls back to the server, keep it there. A catalog
      // refresh may finish in the background, but it belongs to the next search.
      setActiveLocalSearch(null);
    }
    if (!activeSearchQuery) {
      setSortDirection(previousSort);
      setSearchFeedback({
        kind: "error",
        message: GENERIC_SEARCH_ERROR_MESSAGE,
      });
      return;
    }

    setIsSearching(true);
    setSearchFeedback(null);
    const requestId = ++searchRequestIdRef.current;
    try {
      const response = await fetchServerSearch(
        activeSearchQuery.query,
        nextSort,
      );
      if (requestId !== searchRequestIdRef.current) return;
      setResults(response.items);
      setTotalResultCount(response.total);
      setActiveSearchQuery({ query: activeSearchQuery.query });
      setActiveLocalSearch(null);
      setVisibleResultCount(POKETRACE_SEARCH_PAGE_SIZE);
      setSearchFeedback(
        response.items.length === 0
          ? { kind: "empty", message: "No cards found." }
          : null,
      );
      setResultRenderKey((currentKey) => currentKey + 1);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;
      logClientError("Search sorting failed", error);
      setSortDirection(previousSort);
      setSearchFeedback({
        kind: "error",
        message: GENERIC_SEARCH_ERROR_MESSAGE,
      });
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  }

  function handleShowNext() {
    setVisibleResultCount((current) => current + POKETRACE_SEARCH_PAGE_SIZE);
  }

  const searchBar = (
    <DatabaseSearchBar
      autoFocusName={autoFocusName}
      canSearch={canSearch}
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
      onSetNameChange={(value, exact) => {
        setSetName(value);
        setSetNameExact(exact);
      }}
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
                  setCanSearch(true);
                  setResults([]);
                  setTotalResultCount(0);
                  setActiveSearchQuery(null);
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
                <GridView revealOnScroll={false}>
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
              {visibleResultCount < results.length && (
                <div className="search-results__more">
                  <button
                    className="search-results__more-button"
                    onClick={handleShowNext}
                    type="button"
                  >
                    Show next 50
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
