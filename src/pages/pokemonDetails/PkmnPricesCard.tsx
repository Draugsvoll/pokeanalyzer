import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./PkmnPricesCard.scss";

type Price = {
  source: string;
  currency: string;
  condition: string;
  variant: string;
  market_price: number;
};

type Card = {
  id: number;
  name: string;
  number?: string | null;
  rarity?: string | null;
  image_url?: string | null;
  set?: { name?: string };
  prices?: Price[];
  fetched_at: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function PkmnPricesCard({ id }: { id: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/pkmn-cards/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Card not found in the new catalogue");
        return (await response.json()) as Card;
      })
      .then(setCard)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : "Could not load card",
          );
        }
      });
    return () => controller.abort();
  }, [id]);

  if (error) return <div className="card-view">{error}</div>;
  if (!card) return <div className="card-view">Loading card…</div>;

  return (
    <div className="card-view ui-render-fade">
      <div className="card-view__panel-wrap">
        <div className="card-view__shell">
          <div className="card-view__details">
            <div className="card-view__image-side">
              <div className="card-view__image-frame">
                {card.image_url && (
                  <img
                    className="card-view__image"
                    src={card.image_url}
                    alt={card.name}
                  />
                )}
              </div>
            </div>
            <div className="card-view__info-side">
              <div className="card-view__identity">
                <div className="card-view__identity-top">
                  <div className="card-view__title-copy">
                    <h2 className="card-view__title">{card.name}</h2>
                    <p className="card-view__title-set">
                      {card.set?.name}
                      {card.number ? ` · #${card.number}` : ""}
                    </p>
                    {card.rarity && <p>{card.rarity}</p>}
                  </div>
                </div>
                <section
                  className="card-view__info-section"
                  aria-label="Market prices"
                >
                  <h3>Market prices</h3>
                  {!card.prices ? (
                    <p>
                      Market prices have not been imported for this card yet.
                    </p>
                  ) : card.prices.length === 0 ? (
                    <p>No market prices available for this card.</p>
                  ) : (
                    <ul>
                      {card.prices.map((price, index) => (
                        <li
                          key={`${price.source}-${price.condition}-${price.variant}-${index}`}
                        >
                          {price.source} · {price.condition} · {price.variant}:{" "}
                          {price.market_price.toLocaleString(undefined, {
                            style: "currency",
                            currency: price.currency,
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                  <small>Last imported {card.fetched_at}</small>
                </section>
                <Link to="/pkmn-search">Search imported cards</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <section className="pkmn-card-json" aria-label="Saved card JSON">
        <h3>Saved card JSON</h3>
        <pre>{JSON.stringify(card, null, 2)}</pre>
      </section>
    </div>
  );
}
