import React, { useState } from "react";
import "./Frontpage.scss";
import Button from "../button/Button";
import {
  ShoppingBag,
  Package,
  LineChart,
  Shield,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PokemonCard } from "../../types/pokemon";
import { SELECTED_POKEMON_CACHE_KEY } from "../../constants/cache";

const API_URL = import.meta.env.VITE_API_URL;

export const Frontpage: React.FC = () => {
  const navigate = useNavigate();
  const [pokemonName, setPokemonName] = useState("");
  const [setName, setSetName] = useState("");
  const [setSeries, setSetSeries] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [rarity, setRarity] = useState("");
  const [nationalPokedexNumbers, setNationalPokedexNumbers] = useState("");
  const [cardId, setCardId] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [canSearch, setCanSearch] = useState(true);

  const handleClick = (card: PokemonCard) => {
    localStorage.setItem(SELECTED_POKEMON_CACHE_KEY, JSON.stringify(card));
    navigate(`/card/${card.id}`);
  };

  async function handleSearch() {
    if (!canSearch || isSearching) return;

    const trimmedPokemonName = pokemonName.trim();
    const trimmedSetName = setName.trim();
    const trimmedSetSeries = setSeries.trim();
    const trimmedCardNumber = cardNumber.trim();
    const trimmedRarity = rarity.trim();
    const trimmedNationalPokedexNumbers = nationalPokedexNumbers.trim();
    const trimmedCardId = cardId.trim();

    if (
      !trimmedPokemonName &&
      !trimmedSetName &&
      !trimmedSetSeries &&
      !trimmedCardNumber &&
      !trimmedRarity &&
      !trimmedNationalPokedexNumbers &&
      !trimmedCardId
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
      if (trimmedRarity) params.set("rarity", trimmedRarity);
      if (trimmedNationalPokedexNumbers) {
        params.set("nationalPokedexNumbers", trimmedNationalPokedexNumbers);
      }
      if (trimmedCardId) params.set("cardId", trimmedCardId);

      const res = await fetch(
        `${API_URL}/api/cards/search?${params.toString()}`
      );

      if (!res.ok) {
        setResults([]);
        return;
      }

      const data = await res.json();
      setResults(data);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
    } finally {
      setIsSearching(false);

      setTimeout(() => {
        setCanSearch(true);
      }, 2000);
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
    setRarity("");
    setNationalPokedexNumbers("");
    setCardId("");
  };

  return (
    <div className="frontpage-container">
      <section className="hero">
        <h1>Norges markedsplass for Pokémon-kort</h1>
        <p>Kjøp, selg og følg markedspriser på Pokémon-kort i sanntid.</p>

        <section className="action-grid">
          <div className="action-card">
            <div className="action-card-header">
              <div className="action-card-icon">
                <ShoppingBag />
              </div>
              <h3>Kjøp kort</h3>
            </div>
            <p>Finn kort fra samlere i hele Norge.</p>
            <Button className="btn-secondary">Utforsk marked</Button>
          </div>

          <div className="action-card">
            <div className="action-card-header">
              <div className="action-card-icon">
                <Package />
              </div>
              <h3>Selg mine kort</h3>
            </div>
            <p>Lag en annonse på under 2 minutter</p>
            <Button className="btn-secondary" onClick={() => navigate("/sell")}>
              Selg kort
            </Button>
          </div>

          <div className="action-card">
            <div className="action-card-header">
              <div className="action-card-icon">
                <LineChart />
              </div>
              <h3>Verdi estimering</h3>
            </div>
            <p>Søk opp kort og dets verdi i markedet</p>
            <Button className="btn-secondary">Søk kort</Button>
          </div>
        </section>
      </section>

      <section className="database-preview">
        <h2>Pokémon Database</h2>
        <p>Søk blant 20.000+ kort og se globale markedsdata.</p>
        <div className="database-search-container">
          <input
            className="database-search"
            value={pokemonName}
            onChange={(e) => setPokemonName(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="PokemonName"
          />
          <input
            className="database-search"
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="setName"
          />
          <input
            className="database-search"
            value={setSeries}
            onChange={(e) => setSetSeries(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="setSeries"
          />
          <input
            className="database-search"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="cardNumber"
          />
          <input
            className="database-search"
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="rarity"
          />
          <input
            className="database-search"
            value={nationalPokedexNumbers}
            onChange={(e) => setNationalPokedexNumbers(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="nationalPokedexNumbers"
          />
          <input
            className="database-search"
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="cardId"
          />
          <Button className="btn-secondary" onClick={handleClearSearch}>
            Tøm
          </Button>
          <Button
            className="btn-secondary"
            onClick={handleSearch}
            disabled={!canSearch || isSearching}
          >
            {isSearching ? "Søker..." : canSearch ? "Søk" : "Vent litt..."}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="search-results">
            {results.map((card) => (
              <div
                key={card.id}
                className="database-card"
                onClick={() => handleClick(card)}
              >
                <div>
                  <img src={card.images?.small} alt={card.name} />
                </div>
                <div>
                  <h3>{card.name}</h3>
                  <p>
                    <b>Set: </b>
                    {card.set?.name}
                  </p>
                  <p>
                    <b>Series: </b>
                    {card.set?.series}
                  </p>
                  <p>
                    <b>Rarity: </b>
                    {card.rarity}
                  </p>
                  <p>
                    <b>Kortnummer: </b>
                    {card.number}
                  </p>
                  <p>
                    <b>Printed Total: </b>
                    {card.set.printedTotal}
                  </p>
                  <p>
                    <b>National Pokedex: </b>
                    {card.nationalPokedexNumbers?.join(", ") ?? "N/A"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="trust-section">
        <h2>Hvorfor bruke PokéMarket?</h2>

        <div className="trust-grid">
          <div className="trust-item">
            <Shield />
            <span>Verifiserte brukere</span>
          </div>

          <div className="trust-item">
            <TrendingUp />
            <span>Globale markedspriser</span>
          </div>

          <div className="trust-item">
            <Shield />
            <span>Trygge handler</span>
          </div>

          <div className="trust-item">
            <TrendingUp />
            <span>Bygget for samlere</span>
          </div>
        </div>
      </section>
    </div>
  );
};
