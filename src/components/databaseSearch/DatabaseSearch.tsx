import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { SEARCH_HERO_CONTENT } from "../../data/searchHeroContent";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { resolveCardPriceOption } from "../../utils/pokemonPricing";
import "./DatabaseSearch.scss";
import { logClientError } from "../../utils/logClientError";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import { GridView } from "../gridView/GridView";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";
import { Badge } from "../ui/Badge";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type DatabaseSearchProps = {
  autoFocusName?: boolean;
  /** Compact results/wrapper layout for inside another view. Search bar stays shared. */
  embedded?: boolean;
  onSearchStart?: () => void;
  showHero?: boolean;
  /** When set, results render into this element (e.g. below the card shell) */
  resultsPortalEl?: HTMLElement | null;
};

type DatabaseSearchBarProps = {
  autoFocusName: boolean;
  canSearch: boolean;
  cardNumber: string;
  isSearching: boolean;
  onCardNumberChange: (value: string) => void;
  onPokemonNameChange: (value: string) => void;
  onSearch: () => void;
  onSearchKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSetNameChange: (value: string) => void;
  onSetSeriesChange: (value: string) => void;
  pokemonName: string;
  setName: string;
  setSeries: string;
};

type SearchSortDirection =
  "price-high-low" | "price-low-high" | "release-newest" | "release-oldest";

const SEARCH_SORT_OPTIONS: { value: SearchSortDirection; label: string }[] = [
  { value: "price-high-low", label: "Price: high to low" },
  { value: "price-low-high", label: "Price: low to high" },
  { value: "release-newest", label: "Newest releases" },
  { value: "release-oldest", label: "Oldest releases" },
];

export function DatabaseSearchBar({
  autoFocusName,
  canSearch,
  cardNumber,
  isSearching,
  onCardNumberChange,
  onPokemonNameChange,
  onSearch,
  onSearchKeyDown,
  onSetNameChange,
  onSetSeriesChange,
  pokemonName,
  setName,
  setSeries,
}: DatabaseSearchBarProps) {
  const searchButtonBusy = isSearching || !canSearch;
  const pokemonNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocusName) return;
    pokemonNameInputRef.current?.focus({ preventScroll: true });
  }, [autoFocusName]);

  return (
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
        <span className="explore-search-shell__divider" aria-hidden="true" />
        <label className="explore-search-field">
          <input
            className="database-search"
            value={setSeries}
            onChange={(event) => onSetSeriesChange(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Series"
            aria-label="Series"
          />
        </label>
      </div>
      <div className="database-search-actions">
        <button
          type="button"
          className="explore-search-shell__submit"
          onClick={onSearch}
          onMouseDown={(event) => event.preventDefault()}
          disabled={searchButtonBusy}
          aria-busy={searchButtonBusy || undefined}
        >
          {searchButtonBusy ? (
            <span className="database-search-spinner" aria-label="Searching" />
          ) : (
            "Search"
          )}
        </button>
      </div>
    </div>
  );
}

export const DatabaseSearch: React.FC<DatabaseSearchProps> = ({
  autoFocusName = false,
  embedded = false,
  onSearchStart,
  showHero = true,
  resultsPortalEl = null,
}) => {
  const [pokemonName, setPokemonName] = useState("");
  const [setName, setSetName] = useState("");
  const [setSeries, setSetSeries] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [results, setResults] = useState<PokemonCardType[]>([]);
  const [resultRenderKey, setResultRenderKey] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [canSearch, setCanSearch] = useState(true);
  const [sortDirection, setSortDirection] =
    useState<SearchSortDirection>("price-high-low");
  const [activeQueryLabel, setActiveQueryLabel] = useState("");
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      if (
        sortDirection === "release-newest" ||
        sortDirection === "release-oldest"
      ) {
        const aTime = Date.parse(a.set?.releaseDate ?? "");
        const bTime = Date.parse(b.set?.releaseDate ?? "");
        const aSortTime = Number.isNaN(aTime)
          ? sortDirection === "release-newest"
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY
          : aTime;
        const bSortTime = Number.isNaN(bTime)
          ? sortDirection === "release-newest"
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY
          : bTime;

        return sortDirection === "release-newest"
          ? bSortTime - aSortTime
          : aSortTime - bSortTime;
      }

      const getDisplayedPrice = (card: PokemonCardType) =>
        resolveCardPriceOption(card)?.price;
      const aPrice = getDisplayedPrice(a);
      const bPrice = getDisplayedPrice(b);
      const aSortPrice =
        aPrice ??
        (sortDirection === "price-high-low"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
      const bSortPrice =
        bPrice ??
        (sortDirection === "price-high-low"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);

      return sortDirection === "price-high-low"
        ? bSortPrice - aSortPrice
        : aSortPrice - bSortPrice;
    });
  }, [results, sortDirection]);

  async function handleSearch() {
    if (!canSearch || isSearching) return;

    const trimmedPokemonName = pokemonName.trim();
    const trimmedSetName = setName.trim();
    const trimmedSetSeries = setSeries.trim();
    const trimmedCardNumber = cardNumber.trim();

    if (
      !trimmedPokemonName &&
      !trimmedSetName &&
      !trimmedSetSeries &&
      !trimmedCardNumber
    ) {
      setResults([]);
      setActiveQueryLabel("");
      return;
    }

    setIsSearching(true);
    setCanSearch(false);

    try {
      const params = new URLSearchParams();

      if (trimmedPokemonName) params.set("pokemonName", trimmedPokemonName);
      if (trimmedSetName) params.set("setName", trimmedSetName);
      if (trimmedSetSeries) params.set("setSeries", trimmedSetSeries);
      if (trimmedCardNumber) params.set("cardNumber", trimmedCardNumber);

      const res = await fetch(
        `${API_URL}/api/cards/search?${params.toString()}`,
      );

      if (!res.ok) {
        setResults([]);
        return;
      }

      const data = await res.json();
      setResults(data);
      setActiveQueryLabel(
        [
          trimmedPokemonName,
          trimmedCardNumber,
          trimmedSetName,
          trimmedSetSeries,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      setResultRenderKey((currentKey) => currentKey + 1);
    } catch (error) {
      logClientError("Search failed", error);
      setResults([]);
    } finally {
      setIsSearching(false);

      setTimeout(() => {
        setCanSearch(true);
      }, 1000);
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

    const hasSearchInput =
      pokemonName.trim() ||
      setName.trim() ||
      setSeries.trim() ||
      cardNumber.trim();

    if (hasSearchInput) {
      onSearchStart?.();
    }

    handleSearch();
  }
  return (
    <section
      className={`database-preview explore-page${embedded ? " database-preview--embedded" : ""}`}
      id="database-search"
    >
      <div className={embedded ? undefined : "explore-page__inner"}>
        {!embedded && showHero && (
          <header className="explore-hero">
            <span className="explore-hero__eyebrow">
              <Badge accent="blue" size="sm" weight="strong">
                {SEARCH_HERO_CONTENT.eyebrow}
              </Badge>
            </span>
            <h2 className="explore-hero__title">{SEARCH_HERO_CONTENT.title}</h2>
            <p className="explore-hero__subtitle">
              {SEARCH_HERO_CONTENT.subtitle}
            </p>
          </header>
        )}

        <DatabaseSearchBar
          autoFocusName={autoFocusName}
          canSearch={canSearch}
          cardNumber={cardNumber}
          isSearching={isSearching}
          onCardNumberChange={setCardNumber}
          onPokemonNameChange={setPokemonName}
          onSearch={submitSearch}
          onSearchKeyDown={handleSearchKeyDown}
          onSetNameChange={setSetName}
          onSetSeriesChange={setSetSeries}
          pokemonName={pokemonName}
          setName={setName}
          setSeries={setSeries}
        />
        {(() => {
          if (results.length === 0) return null;

          /* Embedded (card switch) uses the same grid cards as /search */
          const resultsNode = (
            <div
              className="search-results search-results--grid ui-render-fade"
              key={resultRenderKey}
            >
              {!embedded && results.length > 0 && (
                <div className="explore-results-toolbar">
                  <div className="explore-results-toolbar__copy">
                    <h3 className="explore-results-toolbar__title">
                      Search results
                    </h3>
                    <p className="explore-results-toolbar__meta">
                      {results.length} card
                      {results.length === 1 ? "" : "s"} matching
                      {activeQueryLabel ? (
                        <> &ldquo;{activeQueryLabel}&rdquo;</>
                      ) : null}
                    </p>
                  </div>
                  <div className="explore-results-toolbar__actions">
                    <label className="explore-sort-control">
                      <span>Sort by</span>
                      <SelectDropdown
                        ariaLabel="Sort search results"
                        className="explore-sort-control__dropdown"
                        options={SEARCH_SORT_OPTIONS}
                        value={sortDirection}
                        onChange={setSortDirection}
                      />
                    </label>
                  </div>
                </div>
              )}
              {results.length > 0 && (
                <GridView className="explore-results explore-results--grid">
                  {sortedResults.map((card) => (
                    <PokemonCardView
                      key={card.id}
                      card={card}
                      showPriceSourcePicker
                    />
                  ))}
                </GridView>
              )}
            </div>
          );

          if (resultsPortalEl) {
            return createPortal(resultsNode, resultsPortalEl);
          }

          return resultsNode;
        })()}
      </div>
    </section>
  );
};
