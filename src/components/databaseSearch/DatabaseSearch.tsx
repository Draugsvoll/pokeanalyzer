import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LayoutGrid, List, Search } from "lucide-react";
import type { PokemonCard } from "../../types/pokemon";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import { formatCardNumber } from "../../utils/formatCardNumber";
import { getTcgPlayerMarketPrice } from "../../utils/pokemonPricing";
import "./DatabaseSearch.scss";
import { logClientError } from "../../utils/logClientError";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type DatabaseSearchProps = {
  autoFocusName?: boolean;
  /** Compact fields-only layout for inside the card shell */
  embedded?: boolean;
  /** When set, results render into this element (e.g. below the card shell) */
  resultsPortalEl?: HTMLElement | null;
};

function rarityBadgeClass(rarity: string): string {
  const r = rarity.toLowerCase();
  if (r.includes("common") && !r.includes("uncommon")) {
    return "card-rarity-badge card-rarity-badge--common";
  }
  if (r.includes("uncommon")) {
    return "card-rarity-badge card-rarity-badge--uncommon";
  }
  if (r.includes("promo")) {
    return "card-rarity-badge card-rarity-badge--promo";
  }
  if (r.includes("rare") || r.includes("holo") || r.includes("ultra")) {
    return "card-rarity-badge card-rarity-badge--rare";
  }
  return "card-rarity-badge";
}

export const DatabaseSearch: React.FC<DatabaseSearchProps> = ({
  autoFocusName = false,
  embedded = false,
  resultsPortalEl = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [pokemonName, setPokemonName] = useState("");
  const [setName, setSetName] = useState("");
  const [setSeries, setSetSeries] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [results, setResults] = useState<PokemonCard[]>([]);
  const [resultRenderKey, setResultRenderKey] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [canSearch, setCanSearch] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeQueryLabel, setActiveQueryLabel] = useState("");

  const handleClick = (card: PokemonCard) => {
    navigateToPokemonCard(navigate, card, {
      scrollToCardView: location.pathname.startsWith("/card"),
    });
  };

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
              disabled={!canSearch || isSearching}
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

        {(() => {
          if (results.length === 0) return null;

          /* Embedded (card switch) uses the same grid cards as /search */
          const useList = !embedded && viewMode === "list";

          const resultsNode = (
            <div
              className={
                useList
                  ? "search-results search-results--list ui-render-fade"
                  : "search-results search-results--grid ui-render-fade"
              }
              key={resultRenderKey}
            >
              {!embedded && (
                <div className="explore-results-toolbar">
                  <div>
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
                    <div
                      className="explore-view-toggle"
                      role="group"
                      aria-label="View mode"
                    >
                      <button
                        type="button"
                        className={`explore-view-toggle__btn${viewMode === "grid" ? " explore-view-toggle__btn--active" : ""}`}
                        aria-pressed={viewMode === "grid"}
                        onClick={() => setViewMode("grid")}
                        aria-label="Grid view"
                      >
                        <LayoutGrid size={15} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        className={`explore-view-toggle__btn${viewMode === "list" ? " explore-view-toggle__btn--active" : ""}`}
                        aria-pressed={viewMode === "list"}
                        onClick={() => setViewMode("list")}
                        aria-label="List view"
                      >
                        <List size={15} strokeWidth={2} />
                      </button>
                    </div>
                    <button type="button" className="explore-filter-chip">
                      Trending first
                      <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
              <div
                className={
                  useList
                    ? "explore-results explore-results--list"
                    : "explore-results explore-results--grid card-grid"
                }
              >
                {results.map((card) => {
                  const price = getTcgPlayerMarketPrice(card.tcgplayer?.prices);
                  const numberLabel = formatCardNumber(card);
                  const setLabel = [
                    card.set?.name,
                    numberLabel
                      ? `${numberLabel}${
                          card.set?.printedTotal
                            ? `/${card.set.printedTotal}`
                            : ""
                        }`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <article
                      key={card.id}
                      className="database-card explore-card card-hover"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleClick(card)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleClick(card);
                        }
                      }}
                    >
                      <div className="database-card__image explore-card__image">
                        <img src={card.images?.small} alt={card.name} />
                      </div>
                      <div className="database-card__content explore-card__body">
                        <header className="database-card__header explore-card__title-row">
                          <div>
                            <h3>{card.name}</h3>
                            <p className="explore-card__set">
                              {setLabel || card.set?.name || "—"}
                            </p>
                          </div>
                          {card.rarity && (
                            <span className={rarityBadgeClass(card.rarity)}>
                              {card.rarity}
                            </span>
                          )}
                        </header>

                        <div className="explore-card__price-row">
                          <div className="explore-card__price">
                            <span className="explore-card__price-label">
                              From
                            </span>
                            <strong>
                              {price != null
                                ? `$${money.format(price)}`
                                : "—"}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
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
