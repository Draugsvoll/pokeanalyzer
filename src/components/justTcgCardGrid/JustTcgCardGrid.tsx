import { useEffect, useState } from "react";
import {
  fetchJustTcgBiggestGainers,
  type JustTcgGainerCard,
  type JustTcgMovementPeriod,
} from "../../services/justTcgFetchesApi";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";
import "./JustTcgCardGrid.scss";

type JustTcgCardGridProps = {
  period?: JustTcgMovementPeriod;
  type: "biggestGainers";
};

const periodLabels: Record<JustTcgMovementPeriod, string> = {
  "24h": "24-hour change",
  "7d": "7-day change",
  "30d": "30-day change",
};

const DISPLAY_LIMIT = 20;

export function JustTcgCardGrid({ period = "7d", type }: JustTcgCardGridProps) {
  const [cards, setCards] = useState<JustTcgGainerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCards() {
      try {
        setLoading(true);
        setError("");
        const results =
          type === "biggestGainers"
            ? await fetchJustTcgBiggestGainers(controller.signal, period)
            : [];

        if (!controller.signal.aborted) {
          setCards(results);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setCards([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "JustTCG cards are unavailable.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadCards();
    return () => controller.abort();
  }, [period, type]);

  if (!loading && (error || cards.length === 0)) return null;

  return (
    <section className="justtcg-card-grid" aria-labelledby="justtcg-grid-title">
      <header className="justtcg-card-grid__header">
        <div>
          <p className="justtcg-card-grid__eyebrow">JustTCG database</p>
          <h2 id="justtcg-grid-title">Biggest raw NM gainers</h2>
        </div>
        <p>{periodLabels[period]}, filtered above $15 and mapped to our card database.</p>
      </header>

      {loading && (
        <div className="justtcg-card-grid__cards" aria-label="Loading JustTCG cards">
          {Array.from({ length: 8 }).map((_, index) => (
            <article
              className="justtcg-card-grid__placeholder"
              key={`placeholder-${index}`}
            />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="justtcg-card-grid__cards">
          {cards.slice(0, DISPLAY_LIMIT).map(({ card, mover }) => (
            <article
              className="justtcg-card-grid__item"
              key={`${card.id}-${mover.printing}-${mover.condition}`}
            >
              <PokemonCardView
                card={card}
                priceChangeLabel={periodLabels[mover.period]}
                priceChangePercent={mover.changePercent}
                priceSource="justtcg"
                showPriceSourcePicker={true}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
