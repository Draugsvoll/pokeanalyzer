import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../button/Button";
import type { PokemonCard } from "../../types/pokemon";
import { navigateToPokemonCard } from "../../utils/selectedPokemonCache";
import "./DatabaseSearch.scss";
import "../../pages/pokemonDetails/components/CardRarityBadge.scss";
import { logClientError } from "../../utils/logClientError";

const API_URL = import.meta.env.VITE_API_URL;
const integerFormatter = new Intl.NumberFormat("en-US");

type DatabaseSearchProps = {
  autoFocusName?: boolean;
  /** Compact fields-only layout for inside the card shell */
  embedded?: boolean;
  /** When set, results render into this element (e.g. below the card shell) */
  resultsPortalEl?: HTMLElement | null;
};

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

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  };

  const handleClearSearch = () => {
    setPokemonName("");
    setSetName("");
    setSetSeries("");
    setCardNumber("");
  };

  return (
    <section
      className={`database-preview${embedded ? " database-preview--embedded" : ""}`}
      id="database-search"
    >
      {!embedded && (
        <>
          <h2>Pokémon Database</h2>
          <p>Søk blant 20.000+ kort og se globale markedsdata.</p>
        </>
      )}
      <div className="database-search-container">
        <input
          className="database-search"
          autoFocus={autoFocusName}
          value={pokemonName}
          onChange={(e) => setPokemonName(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Name"
        />
        <input
          className="database-search"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Set"
        />
        <input
          className="database-search"
          value={setSeries}
          onChange={(e) => setSetSeries(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Series"
        />
        <input
          className="database-search"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Number"
        />
        <Button
          variant="secondary"
          onClick={handleSearch}
          disabled={!canSearch || isSearching}
        >
          Søk
        </Button>
        <Button variant="secondary" onClick={handleClearSearch}>
          Tøm
        </Button>
      </div>

      {(() => {
        if (results.length === 0) return null;

        const resultsNode = (
          <div
            className="search-results ui-render-fade"
            key={resultRenderKey}
          >
            {results.map((card) => (
              <article
                key={card.id}
                className="database-card card-hover"
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
                <div className="database-card__image">
                  <img src={card.images?.small} alt={card.name} />
                </div>
                <div className="database-card__content">
                  <header className="database-card__header">
                    <div>
                      <h3>{card.name}</h3>
                      <p>{card.set?.name}</p>
                    </div>
                    {card.rarity && (
                      <span className="card-rarity-badge">{card.rarity}</span>
                    )}
                  </header>

                  <dl className="database-card__metadata">
                    <div>
                      <dt>Number</dt>
                      <dd>
                        {card.number && card.set.printedTotal !== undefined
                          ? `${card.number} / ${integerFormatter.format(card.set.printedTotal)}`
                          : card.number ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Set cards</dt>
                      <dd>{card.set.printedTotal ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Artist</dt>
                      <dd>{card.artist ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Series</dt>
                      <dd>{card.set?.series ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        );

        if (resultsPortalEl) {
          return createPortal(resultsNode, resultsPortalEl);
        }

        return resultsNode;
      })()}
    </section>
  );
};
