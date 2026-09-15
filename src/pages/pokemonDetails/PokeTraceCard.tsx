import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./PkmnPricesCard.scss";

type TierPrice = { avg?: number | null };
type Card = {
  id: string;
  name: string;
  cardNumber?: string | null;
  set?: { name?: string | null } | null;
  variant?: string | null;
  rarity?: string | null;
  image?: string | null;
  currency?: string | null;
  prices?: Record<string, Record<string, TierPrice>>;
  lastUpdated?: string | null;
  fetched_at: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function PokeTraceCard({ id }: { id: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/poketrace-cards/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Card not found in PokeTrace trial database");
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

  const prices = Object.entries(card.prices ?? {}).flatMap(([source, tiers]) =>
    Object.entries(tiers ?? {}).flatMap(([tier, value]) =>
      typeof value?.avg === "number"
        ? [{ source, tier, amount: value.avg }]
        : [],
    ),
  );

  return (
    <div className="card-view ui-render-fade">
      <div className="card-view__panel-wrap">
        <div className="card-view__shell">
          <div className="card-view__details">
            <div className="card-view__image-side">
              <div className="card-view__image-frame">
                {card.image && (
                  <img
                    className="card-view__image"
                    src={card.image}
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
                      {card.set?.name ?? "Unknown set"}
                      {card.cardNumber ? ` · #${card.cardNumber}` : ""}
                    </p>
                    {card.variant && <p>{card.variant.replaceAll("_", " ")}</p>}
                    {card.rarity && <p>{card.rarity}</p>}
                  </div>
                </div>
                <section
                  className="card-view__info-section"
                  aria-label="Market prices"
                >
                  <h3>Market prices</h3>
                  {prices.length === 0 ? (
                    <p>No market prices available for this card.</p>
                  ) : (
                    <ul>
                      {prices.map(({ source, tier, amount }) => (
                        <li key={`${source}-${tier}`}>
                          {source} · {tier.replaceAll("_", " ")}:{" "}
                          {amount.toLocaleString(undefined, {
                            style: "currency",
                            currency: card.currency ?? "USD",
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                  {card.lastUpdated && (
                    <small>Provider updated {card.lastUpdated}</small>
                  )}
                  <small>Last imported {card.fetched_at}</small>
                </section>
                <Link to="/poketrace-search">Search imported cards</Link>
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
