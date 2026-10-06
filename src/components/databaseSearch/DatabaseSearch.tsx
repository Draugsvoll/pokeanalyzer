import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
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
} from "../../services/pokeTraceCatalog";
import { SearchResultsToolbar } from "./SearchResultsToolbar";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import {
  isPokeTraceRawCondition,
  POKETRACE_RAW_CONDITIONS,
  POKETRACE_RAW_CONDITION_LABELS,
  type PokeTraceRawCondition,
} from "../../../shared/pokeTraceMarketConditions";
import {
  POKETRACE_SEARCH_PAGE_SIZE,
  type PokeTraceSearchResponse,
} from "../../../shared/pokeTraceSearch";
import { AutosuggestCombobox } from "../autosuggestCombobox/AutosuggestCombobox";
import { usePokeTraceSetNameOptions } from "../../hooks/usePokeTraceSetNameOptions";
import {
  POKETRACE_DEFAULT_CARD_SORT,
  sortPokeTraceCards,
  type PokeTraceCardSort,
} from "../../utils/sortPokeTraceCards";
import { runWithRequestTimeout } from "../../utils/requestTimeout";
import { waitForUiPaint } from "../../utils/waitForUiPaint";
import type { ProductType } from "../productTypeSwitch/ProductTypeSwitch";
import {
  SealedDatabaseSearchBar,
  SealedDatabaseSearchResults,
} from "./SealedDatabaseSearch";
import { useSealedDatabaseSearch } from "./useSealedDatabaseSearch";
import {
  DatabaseSearchBarShell,
  DatabaseSearchPriceFields,
  type PriceFilterValidation,
} from "./DatabaseSearchBarShell";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type DatabaseSearchProps = {
  autoFocusName?: boolean;
  /** Compact results/wrapper layout for inside another view. Search bar stays shared. */
  embedded?: boolean;
  initialProductType?: ProductType;
  onClose?: () => void;
  onPortfolioChanged?: (saved: boolean) => void;
};

type DatabaseSearchFilters = {
  condition: PokeTraceRawCondition;
  maxPrice: string;
  minPrice: string;
  rarity: string;
};

type SearchFeedback = {
  kind: "empty" | "error";
  message: string;
};

type SinglesUrlSearch = {
  cardNumber: string;
  filters: DatabaseSearchFilters;
  pokemonName: string;
  setName: string;
  setNameExact: boolean;
};

const DEFAULT_SEARCH_FILTERS: DatabaseSearchFilters = {
  condition: "NEAR_MINT",
  maxPrice: "",
  minPrice: "",
  rarity: "",
};
const GENERIC_SEARCH_ERROR_MESSAGE =
  "We couldn’t complete your search. Please try again.";

function readSinglesUrlSearch(searchParams: URLSearchParams) {
  if (searchParams.get("mode") === "sealed") return null;

  const condition = searchParams.get("condition") ?? "NEAR_MINT";
  return {
    cardNumber: searchParams.get("number")?.trim() ?? "",
    filters: {
      condition: isPokeTraceRawCondition(condition) ? condition : "NEAR_MINT",
      maxPrice: searchParams.get("max")?.trim() ?? "",
      minPrice: searchParams.get("min")?.trim() ?? "",
      rarity: searchParams.get("rarity")?.trim() ?? "",
    },
    pokemonName: searchParams.get("name")?.trim() ?? "",
    setName: searchParams.get("set")?.trim() ?? "",
    setNameExact: searchParams.get("exact") === "true",
  } satisfies SinglesUrlSearch;
}

function createSinglesSearchParams(search: SinglesUrlSearch) {
  const searchParams = new URLSearchParams({ mode: "singles" });
  if (search.pokemonName) searchParams.set("name", search.pokemonName);
  if (search.cardNumber) searchParams.set("number", search.cardNumber);
  if (search.setName) searchParams.set("set", search.setName);
  if (search.setName && search.setNameExact) {
    searchParams.set("exact", "true");
  }
  if (search.filters.minPrice) {
    searchParams.set("min", search.filters.minPrice);
  }
  if (search.filters.maxPrice) {
    searchParams.set("max", search.filters.maxPrice);
  }
  if (search.filters.rarity) {
    searchParams.set("rarity", search.filters.rarity);
  }
  searchParams.set("condition", search.filters.condition);
  return searchParams;
}

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
    filters.condition !== "NEAR_MINT",
    Boolean(filters.minPrice.trim()),
    Boolean(filters.maxPrice.trim()),
    Boolean(filters.rarity),
  ].filter(Boolean).length;
}

async function fetchServerSearch(
  query: string,
  signal?: AbortSignal,
): Promise<PokeTraceSearchResponse<PokemonCardType>> {
  return runWithRequestTimeout(
    async (requestSignal) => {
      const response = await fetch(`${API_URL}/api/cards/search?${query}`, {
        signal: requestSignal,
      });

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
    },
    { signal },
  );
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
  const [rarityOptions, setRarityOptions] = useState(FALLBACK_RARITY_OPTIONS);
  const setNameOptions = usePokeTraceSetNameOptions();
  const filterCount = activeFilterCount(filters);
  const hasSearchCriteria = Boolean(
    pokemonName.trim() || setName.trim() || cardNumber.trim() || filterCount,
  );
  const searchButtonDisabled =
    isSearching || !canSearch || !hasSearchCriteria || !!priceFilterValidation;
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
    <DatabaseSearchBarShell
      autoFocusName={autoFocusName}
      filterCount={filterCount}
      filterFields={
        <>
          <DatabaseSearchPriceFields
            maxPrice={filters.maxPrice}
            minPrice={filters.minPrice}
            onKeyDown={onSearchKeyDown}
            onMaxPriceChange={(maxPrice) => onFiltersChange({ maxPrice })}
            onMinPriceChange={(minPrice) => onFiltersChange({ minPrice })}
            validation={priceFilterValidation}
          />

          <div className="database-search-filter-field">
            <AutosuggestCombobox
              ariaLabel="Filter by rarity"
              className="database-search-rarity-combobox"
              menuLabel="Rarity suggestions"
              onInputChange={(rarity) => onFiltersChange({ rarity })}
              onKeyDown={onSearchKeyDown}
              onSelect={(rarity) => onFiltersChange({ rarity })}
              options={rarityOptions}
              placeholder="Rarity"
              value={filters.rarity}
            />
          </div>

          <div className="database-search-filter-field">
            <SelectDropdown
              ariaLabel="Filter by condition"
              className="database-search-condition-select"
              onChange={(condition) => onFiltersChange({ condition })}
              options={CONDITION_OPTIONS}
              value={filters.condition}
            />
          </div>
        </>
      }
      isSearching={isSearching}
      onClearFilters={onFiltersClear}
      onSearch={onSearch}
      renderFields={(pokemonNameInputRef) => (
        <>
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
        </>
      )}
      searchDisabled={searchButtonDisabled}
    />
  );
}

function getSearchResultMarketDisplay(
  card: PokemonCardType,
  condition: PokeTraceRawCondition | "",
) {
  if (!condition) return undefined;

  const conditionLabel = POKETRACE_RAW_CONDITION_LABELS[condition];
  return {
    condition,
    currency: card.pokeTrace.currency,
    marketLabel: conditionLabel,
    price: resolvePokeTraceCardPrice(card, condition)?.price,
    priceLabel: `TCGPlayer · ${conditionLabel}`,
    source: "tcgplayer",
  };
}

export const DatabaseSearch: React.FC<DatabaseSearchProps> = ({
  autoFocusName = false,
  embedded = false,
  initialProductType = "singles",
  onClose,
  onPortfolioChanged,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const urlProductType = searchParams.get("mode");
  const initialSinglesSearch = embedded
    ? null
    : readSinglesUrlSearch(searchParams);
  const [productType, setProductType] = useState<ProductType>(() =>
    !embedded && (urlProductType === "sealed" || urlProductType === "singles")
      ? urlProductType
      : initialProductType,
  );
  const [focusModeInput, setFocusModeInput] = useState(false);
  const sealedSearch = useSealedDatabaseSearch(
    productType === "sealed",
    !embedded,
  );
  const [pokemonName, setPokemonName] = useState(
    initialSinglesSearch?.pokemonName ?? "",
  );
  const [setName, setSetName] = useState(initialSinglesSearch?.setName ?? "");
  const [setNameExact, setSetNameExact] = useState(
    initialSinglesSearch?.setNameExact ?? false,
  );
  const [cardNumber, setCardNumber] = useState(
    initialSinglesSearch?.cardNumber ?? "",
  );
  const [filters, setFilters] = useState<DatabaseSearchFilters>(
    initialSinglesSearch?.filters ?? DEFAULT_SEARCH_FILTERS,
  );
  const [results, setResults] = useState<PokemonCardType[]>([]);
  const [totalResultCount, setTotalResultCount] = useState(0);
  const [activeCondition, setActiveCondition] = useState<
    PokeTraceRawCondition | ""
  >("");
  const [visibleResultCount, setVisibleResultCount] = useState(
    POKETRACE_SEARCH_PAGE_SIZE,
  );
  const [resultRenderKey, setResultRenderKey] = useState(0);
  const searchRequestIdRef = useRef(0);
  const searchRequestControllerRef = useRef<AbortController | null>(null);
  const sortRequestIdRef = useRef(0);
  const searchCooldownTimerRef = useRef<number | undefined>(undefined);
  const runSinglesUrlSearchRef = useRef<
    (search: SinglesUrlSearch, force?: boolean) => Promise<void>
  >(async () => undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [canSearch, setCanSearch] = useState(true);
  const [sortDirection, setSortDirection] = useState<PokeTraceCardSort>(
    POKETRACE_DEFAULT_CARD_SORT,
  );
  const [isSorting, setIsSorting] = useState(false);
  const [activeQueryLabel, setActiveQueryLabel] = useState("");
  const [searchFeedback, setSearchFeedback] = useState<SearchFeedback | null>(
    null,
  );
  const priceFilterValidation = validatePriceFilters(filters);
  useEffect(() => {
    if (embedded) return;
    if (urlProductType === "sealed" || urlProductType === "singles") {
      // The browser URL is external navigation state; Back/Forward must restore the mode.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProductType(urlProductType);
    }
  }, [embedded, urlProductType]);

  useEffect(() => {
    return () => {
      searchRequestIdRef.current += 1;
      sortRequestIdRef.current += 1;
      searchRequestControllerRef.current?.abort();
      searchRequestControllerRef.current = null;
      window.clearTimeout(searchCooldownTimerRef.current);
    };
  }, []);
  const sortedResults = useMemo(
    () =>
      sortPokeTraceCards(results, sortDirection, {
        condition: activeCondition || "NEAR_MINT",
        getPriceChangeDisplayContext: (card) => ({
          marketDisplay: getSearchResultMarketDisplay(card, activeCondition),
        }),
      }),
    [activeCondition, results, sortDirection],
  );
  const visibleResults = sortedResults.slice(0, visibleResultCount);

  async function handleSearch(
    search: SinglesUrlSearch = {
      cardNumber,
      filters,
      pokemonName,
      setName,
      setNameExact,
    },
    force = false,
  ) {
    if (!force && (!canSearch || isSearching)) return;

    const trimmedPokemonName = search.pokemonName.trim();
    const trimmedSetName = search.setName.trim();
    const trimmedCardNumber = search.cardNumber.trim();
    const minPrice = optionalPrice(search.filters.minPrice);
    const maxPrice = optionalPrice(search.filters.maxPrice);
    const rarity = search.filters.rarity.trim();
    const condition = search.filters.condition;
    const hasNonDefaultCondition = condition !== "NEAR_MINT";
    const nextSortDirection = POKETRACE_DEFAULT_CARD_SORT;

    if (
      !trimmedPokemonName &&
      !trimmedSetName &&
      !trimmedCardNumber &&
      minPrice === undefined &&
      maxPrice === undefined &&
      !rarity &&
      !hasNonDefaultCondition
    ) {
      setResults([]);
      setTotalResultCount(0);
      setActiveQueryLabel("");
      setActiveCondition("");
      setSearchFeedback(null);
      return;
    }
    if (validatePriceFilters(search.filters)) return;

    sortRequestIdRef.current += 1;
    setIsSorting(false);
    setIsSearching(true);
    setCanSearch(false);
    setSearchFeedback(null);
    const requestId = ++searchRequestIdRef.current;
    searchRequestControllerRef.current?.abort();
    const requestController = new AbortController();
    searchRequestControllerRef.current = requestController;
    await waitForUiPaint();
    if (requestId !== searchRequestIdRef.current) return;

    try {
      const params = new URLSearchParams();
      if (trimmedPokemonName) params.set("pokemonName", trimmedPokemonName);
      if (trimmedSetName) params.set("setName", trimmedSetName);
      if (trimmedSetName && search.setNameExact) {
        params.set("setNameExact", "true");
      }
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
        ...(search.setNameExact && { setNameExact: true }),
        ...(condition && { condition }),
      };
      const localResults = await searchCachedPokeTraceCatalog(catalogSearch);
      if (requestId !== searchRequestIdRef.current) return;
      const serverResponse =
        localResults !== null
          ? null
          : await fetchServerSearch(serverQuery, requestController.signal);
      if (requestId !== searchRequestIdRef.current) return;
      const data = localResults ?? serverResponse?.items ?? [];

      setResults(data);
      setTotalResultCount(
        localResults !== null ? data.length : (serverResponse?.total ?? 0),
      );
      setActiveCondition(condition);
      setSortDirection(nextSortDirection);
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
      setActiveQueryLabel("");
      setActiveCondition("");
      setSearchFeedback({
        kind: "error",
        message: GENERIC_SEARCH_ERROR_MESSAGE,
      });
      setCanSearch(true);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        if (searchRequestControllerRef.current === requestController) {
          searchRequestControllerRef.current = null;
        }
        setIsSearching(false);

        window.clearTimeout(searchCooldownTimerRef.current);
        searchCooldownTimerRef.current = window.setTimeout(() => {
          setCanSearch(true);
        }, 1000);
      }
    }
  }

  runSinglesUrlSearchRef.current = handleSearch;

  useEffect(() => {
    if (embedded || productType !== "singles") return;

    const urlSearch = readSinglesUrlSearch(
      new URLSearchParams(searchParamsKey),
    );
    if (!urlSearch) return;

    // These controlled fields intentionally mirror browser navigation state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPokemonName(urlSearch.pokemonName);
    setSetName(urlSearch.setName);
    setSetNameExact(urlSearch.setNameExact);
    setCardNumber(urlSearch.cardNumber);
    setFilters(urlSearch.filters);

    if (validatePriceFilters(urlSearch.filters)) {
      setResults([]);
      setTotalResultCount(0);
      setActiveQueryLabel("");
      setActiveCondition("");
      setSearchFeedback(null);
      return;
    }

    void runSinglesUrlSearchRef.current(urlSearch, true);
  }, [embedded, productType, searchParamsKey]);

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      submitSearch();
    }
  };

  function submitSearch() {
    if (!canSearch || isSearching) return;
    const nextSearch: SinglesUrlSearch = {
      cardNumber: cardNumber.trim(),
      filters: {
        ...filters,
        maxPrice: filters.maxPrice.trim(),
        minPrice: filters.minPrice.trim(),
        rarity: filters.rarity.trim(),
      },
      pokemonName: pokemonName.trim(),
      setName: setName.trim(),
      setNameExact,
    };
    if (embedded) {
      void handleSearch(nextSearch);
      return;
    }
    const nextSearchParams = createSinglesSearchParams(nextSearch);
    if (nextSearchParams.toString() === searchParamsKey) {
      void handleSearch(nextSearch);
      return;
    }
    setSearchParams(nextSearchParams);
  }

  async function handleSortChange(nextSort: PokeTraceCardSort) {
    if (nextSort === sortDirection || isSearching || isSorting) return;
    const requestId = ++sortRequestIdRef.current;
    setIsSorting(true);
    await waitForUiPaint();
    if (requestId !== sortRequestIdRef.current) return;
    setSortDirection(nextSort);
    setVisibleResultCount(POKETRACE_SEARCH_PAGE_SIZE);
    setIsSorting(false);
  }

  function handleShowNext() {
    setVisibleResultCount((current) => current + POKETRACE_SEARCH_PAGE_SIZE);
  }

  function handleProductTypeChange(nextProductType: ProductType) {
    if (nextProductType === productType) return;
    setProductType(nextProductType);
    setFocusModeInput(true);
    if (!embedded && searchParamsKey) {
      setSearchParams(new URLSearchParams(), { replace: true });
    }
  }

  const shouldFocusNameInput = autoFocusName || focusModeInput;

  const searchBar = (
    <DatabaseSearchBar
      autoFocusName={shouldFocusNameInput}
      canSearch={canSearch}
      cardNumber={cardNumber}
      filters={filters}
      isSearching={isSearching}
      onCardNumberChange={setCardNumber}
      onFiltersChange={(updates) =>
        setFilters((current) => ({ ...current, ...updates }))
      }
      onFiltersClear={() => setFilters(DEFAULT_SEARCH_FILTERS)}
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
  const activeSearchBar =
    productType === "sealed" ? (
      <SealedDatabaseSearchBar
        autoFocusName={shouldFocusNameInput}
        search={sealedSearch}
      />
    ) : (
      searchBar
    );

  return (
    <section
      className={`database-preview explore-page${embedded ? " database-preview--embedded" : ""}`}
      id="database-search"
    >
      <div className={embedded ? undefined : "explore-page__inner"}>
        {embedded ? (
          activeSearchBar
        ) : (
          <SearchHero
            onProductTypeChange={handleProductTypeChange}
            productType={productType}
          >
            <div
              className="database-search-mode ui-render-fade"
              key={productType}
            >
              {activeSearchBar}
            </div>
          </SearchHero>
        )}
        {productType === "singles" && searchFeedback && !isSearching && (
          <div
            className={`database-search-feedback database-search-feedback--${searchFeedback.kind}`}
            role={searchFeedback.kind === "error" ? "alert" : "status"}
          >
            {searchFeedback.message}
          </div>
        )}
        {productType === "singles" &&
          (() => {
            if (results.length === 0) return null;

            /* Embedded (card switch) uses the same grid cards as /search */
            const resultsNode = (
              <div
                className="search-results search-results--grid ui-render-fade"
                key={resultRenderKey}
              >
                <SearchResultsToolbar
                  activeQueryLabel={activeQueryLabel}
                  includeChangeSort={
                    !activeCondition || activeCondition === "NEAR_MINT"
                  }
                  onClose={() => {
                    searchRequestIdRef.current += 1;
                    sortRequestIdRef.current += 1;
                    searchRequestControllerRef.current?.abort();
                    searchRequestControllerRef.current = null;
                    window.clearTimeout(searchCooldownTimerRef.current);
                    setIsSearching(false);
                    setIsSorting(false);
                    setCanSearch(true);
                    setResults([]);
                    setTotalResultCount(0);
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
                  <GridView revealOnScroll={false} sorting={isSorting}>
                    {visibleResults.map((card) => {
                      return (
                        <PokemonCardView
                          key={card.id}
                          card={card}
                          marketDisplay={getSearchResultMarketDisplay(
                            card,
                            activeCondition,
                          )}
                          onPortfolioChanged={onPortfolioChanged}
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
        {productType === "sealed" && (
          <SealedDatabaseSearchResults search={sealedSearch} />
        )}
      </div>
    </section>
  );
};
