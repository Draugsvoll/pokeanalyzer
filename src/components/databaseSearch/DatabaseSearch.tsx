import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { PokemonCard as PokemonCardType } from "../../types/pokemon";
import { resolvePokeTraceCardPrice } from "../../utils/pokeTracePricing";
import "./DatabaseSearch.scss";
import { logClientError } from "../../utils/logClientError";
import { GridView } from "../gridView/GridView";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";
import { SearchHero } from "../searchHero/SearchHero";
import { searchCachedPokeTraceCatalog } from "../../services/pokeTraceCatalog";
import {
  SearchResultsToolbar,
  type SearchSortDirection,
} from "./SearchResultsToolbar";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type DatabaseSearchProps = {
  autoFocusName?: boolean;
  /** Compact results/wrapper layout for inside another view. Search bar stays shared. */
  embedded?: boolean;
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
  pokemonName: string;
  setName: string;
};

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
  pokemonName,
  setName,
}: DatabaseSearchBarProps) {
  const searchButtonDisabled = isSearching || !canSearch;
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
}) => {
  const [pokemonName, setPokemonName] = useState("");
  const [setName, setSetName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [results, setResults] = useState<PokemonCardType[]>([]);
  const [resultRenderKey, setResultRenderKey] = useState(0);
  const searchCooldownTimerRef = useRef<number | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [canSearch, setCanSearch] = useState(true);
  const [sortDirection, setSortDirection] =
    useState<SearchSortDirection>("price-high-low");
  const [activeQueryLabel, setActiveQueryLabel] = useState("");
  useEffect(
    () => () => window.clearTimeout(searchCooldownTimerRef.current),
    [],
  );
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const getDisplayedPrice = (card: PokemonCardType) =>
        resolvePokeTraceCardPrice(card)?.price;
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
    const trimmedCardNumber = cardNumber.trim();

    if (!trimmedPokemonName && !trimmedSetName && !trimmedCardNumber) {
      setResults([]);
      setActiveQueryLabel("");
      return;
    }

    setIsSearching(true);
    setCanSearch(false);

    try {
      const searchApi = async (): Promise<PokemonCardType[] | null> => {
        const params = new URLSearchParams();

        if (trimmedPokemonName) params.set("pokemonName", trimmedPokemonName);
        if (trimmedSetName) params.set("setName", trimmedSetName);
        if (trimmedCardNumber) params.set("cardNumber", trimmedCardNumber);

        const res = await fetch(
          `${API_URL}/api/cards/search?${params.toString()}`,
        );

        if (!res.ok) return null;
        return res.json();
      };

      const localResults = searchCachedPokeTraceCatalog({
        pokemonName: trimmedPokemonName,
        setName: trimmedSetName,
        cardNumber: trimmedCardNumber,
      });
      const data = localResults ?? (await searchApi());

      if (!data) {
        setResults([]);
        return;
      }
      setResults(data);
      setActiveQueryLabel(
        [trimmedPokemonName, trimmedCardNumber, trimmedSetName]
          .filter(Boolean)
          .join(" · "),
      );
      setResultRenderKey((currentKey) => currentKey + 1);
    } catch (error) {
      logClientError("Search failed", error);
      setResults([]);
    } finally {
      setIsSearching(false);

      window.clearTimeout(searchCooldownTimerRef.current);
      searchCooldownTimerRef.current = window.setTimeout(() => {
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

    handleSearch();
  }

  const searchBar = (
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
      pokemonName={pokemonName}
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
                  setResults([]);
                  setActiveQueryLabel("");
                }}
                onSortChange={setSortDirection}
                resultCount={results.length}
                sortDirection={sortDirection}
              />
              {results.length > 0 && (
                <GridView>
                  {sortedResults.map((card) => (
                    <PokemonCardView key={card.id} card={card} />
                  ))}
                </GridView>
              )}
            </div>
          );

          return resultsNode;
        })()}
      </div>
    </section>
  );
};
