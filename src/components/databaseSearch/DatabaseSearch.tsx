import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";
import "./DatabaseSearch.scss";
import { logClientError } from "../../utils/logClientError";
import { SelectDropdown } from "../selectDropdown/SelectDropdown";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type DatabaseSearchProps = {
  autoFocusName?: boolean;
  /** Compact fields-only layout for inside the card shell */
  embedded?: boolean;
  /** When set, results render into this element (e.g. below the card shell) */
  resultsPortalEl?: HTMLElement | null;
};

type SearchSortDirection =
  | "price-high-low"
  | "price-low-high"
  | "release-newest"
  | "release-oldest";

const SEARCH_SORT_OPTIONS: { value: SearchSortDirection; label: string }[] = [
  { value: "price-high-low", label: "Price: high to low" },
  { value: "price-low-high", label: "Price: low to high" },
  { value: "release-newest", label: "Newest releases" },
  { value: "release-oldest", label: "Oldest releases" },
];

export const DatabaseSearch: React.FC<DatabaseSearchProps> = ({
  autoFocusName = false,
  embedded = false,
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

      const aPrice = getTcgPlayerMarketPrice(a.tcgplayer?.prices);
      const bPrice = getTcgPlayerMarketPrice(b.tcgplayer?.prices);
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
        `${API_URL}/api/cards/search?${params.toString()}`
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
          .join(" · ")
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
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  };
  const searchButtonBusy = isSearching || !canSearch;

  return (
    <section
      className={`database-preview explore-page${embedded ? " database-preview--embedded" : ""}`}
      id="database-search"
    >
      <div className={embedded ? undefined : "explore-page__inner"}>
        {!embedded && (
          <header className="explore-hero">
            <p className="explore-hero__eyebrow">
              20,000+ cards · Global market data
            </p>
            <h2 className="explore-hero__title">Find your next card.</h2>
            <p className="explore-hero__subtitle">
              Search by Pokémon, set, series, artist or card number.
            </p>
          </header>
        )}

        <div className="database-search-container explore-search-shell">
          <div
            className="database-search-fields explore-search-shell__fields"
            role="group"
            aria-label="Search fields"
          >
            <label className="explore-search-field">
              <Search
                className="explore-search-field__icon"
                size={18}
                strokeWidth={1.5}
                absoluteStrokeWidth
                aria-hidden="true"
              />
              <input
                className="database-search"
                autoFocus={autoFocusName}
                value={pokemonName}
                onChange={(e) => setPokemonName(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Name"
                aria-label="Pokémon name"
              />
            </label>
            <span className="explore-search-shell__divider" aria-hidden="true" />
            <label className="explore-search-field">
              <input
                className="database-search database-search--number"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="No."
                aria-label="Card number"
              />
            </label>
            <span className="explore-search-shell__divider" aria-hidden="true" />
            <label className="explore-search-field">
              <input
                className="database-search"
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Set"
                aria-label="Set name"
              />
            </label>
            <span className="explore-search-shell__divider" aria-hidden="true" />
            <label className="explore-search-field">
              <input
                className="database-search"
                value={setSeries}
                onChange={(e) => setSetSeries(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Series"
                aria-label="Series"
              />
            </label>
          </div>
          <div className="database-search-actions">
            <button
              type="button"
              className="explore-search-shell__submit"
              onClick={handleSearch}
              disabled={searchButtonBusy}
              aria-busy={searchButtonBusy || undefined}
            >
              {searchButtonBusy ? (
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
                        <>
                          {" "}
                          &ldquo;{activeQueryLabel}&rdquo;
                        </>
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
                <div
                  className="explore-results explore-results--grid card-grid"
                >
                {sortedResults.map((card) => (
                  <PokemonCardView
                    key={card.id}
                    card={card}
                  />
                ))}
                </div>
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
