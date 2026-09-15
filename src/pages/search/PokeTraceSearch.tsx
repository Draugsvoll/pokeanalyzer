import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import "./PkmnPricesSearch.scss";

type SearchCard = {
  id: string;
  name: string;
  card_number: string | null;
  set_name: string | null;
  rarity: string | null;
  variant: string | null;
  image_url: string | null;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function PokeTraceSearch() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [cards, setCards] = useState<SearchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ name: query });
    fetch(`${API_URL}/api/poketrace-cards/search?${params}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not search PokeTrace cards");
        return (await response.json()) as SearchCard[];
      })
      .then((results) => {
        if (!controller.signal.aborted) {
          setCards(results);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Search failed");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [query, searchAttempt]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setQuery(input.trim());
    setSearchAttempt((attempt) => attempt + 1);
  }

  return (
    <main className="pkmn-search">
      <div className="pkmn-search__header">
        <h1>PokeTrace card catalogue</h1>
        <p>Search English US singles saved in the local trial database.</p>
      </div>
      <form className="pkmn-search__form" onSubmit={handleSearch}>
        <label htmlFor="poketrace-card-name">Card name</label>
        <div className="pkmn-search__controls">
          <input
            id="poketrace-card-name"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search imported cards"
            maxLength={100}
          />
          <button type="submit">Search</button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Loading cards…</p>
      ) : cards.length === 0 ? (
        <p>No imported cards match your search.</p>
      ) : (
        <>
          <p className="pkmn-search__count">{cards.length} cards shown</p>
          <div className="pkmn-search__results">
            {cards.map((card) => (
              <Link
                key={card.id}
                className="pkmn-search__card"
                to={`/card/poketrace-${card.id}`}
              >
                {card.image_url && <img src={card.image_url} alt="" />}
                <span>
                  <strong>{card.name}</strong>
                  <small>
                    {card.set_name ?? "Unknown set"}
                    {card.card_number ? ` · #${card.card_number}` : ""}
                  </small>
                  {card.variant && (
                    <small>{card.variant.replaceAll("_", " ")}</small>
                  )}
                  {card.rarity && <small>{card.rarity}</small>}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
