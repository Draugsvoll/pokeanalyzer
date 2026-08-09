import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  fetchJustTcgBiggestGainers,
  type JustTcgGainerCard,
  type JustTcgMovementPeriod,
} from "../../services/justTcgFetchesApi";
import { GridView } from "../gridView/GridView";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";
import { Swimlane } from "../swimlane/Swimlane";
import "./JustTcgCardGrid.scss";

type JustTcgCardGridProps = {
  layout?: "grid" | "swimlane";
  period?: JustTcgMovementPeriod;
  type: "biggestGainers";
};

const periodLabels: Record<JustTcgMovementPeriod, string> = {
  "24h": "24-hour change",
  "7d": "7-day change",
  "30d": "30-day change",
};

const DISPLAY_LIMIT = 20;

function CardLayout({
  children,
  layout,
}: {
  children: ReactNode;
  layout: "grid" | "swimlane";
}) {
  if (layout === "swimlane") {
    return (
      <Swimlane className="justtcg-card-grid__cards" size="card">
        {children}
      </Swimlane>
    );
  }

  return <GridView className="justtcg-card-grid__cards">{children}</GridView>;
}

export function JustTcgCardGrid({
  layout = "grid",
  period = "7d",
  type,
}: JustTcgCardGridProps) {
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
        <h2 id="justtcg-grid-title">Weekly Gainers</h2>
        <p>{periodLabels[period]} · Near Mint raw singles above $15</p>
      </header>

      {loading && (
        <CardLayout layout={layout}>
          {Array.from({ length: 8 }).map((_, index) => (
            <article
              className="justtcg-card-grid__placeholder"
              key={`placeholder-${index}`}
            />
          ))}
        </CardLayout>
      )}

      {!loading && !error && (
        <CardLayout layout={layout}>
          {cards.slice(0, DISPLAY_LIMIT).map(({ card, mover }, index) => (
            <PokemonCardView
              key={[
                card.id,
                mover.printing,
                mover.condition,
                mover.setName ?? "",
                index,
              ].join("-")}
              card={card}
              priceChangeLabel={periodLabels[mover.period]}
              priceChangePercent={mover.changePercent}
              priceSource="justtcg"
              showPriceSourcePicker={true}
            />
          ))}
        </CardLayout>
      )}
    </section>
  );
}
