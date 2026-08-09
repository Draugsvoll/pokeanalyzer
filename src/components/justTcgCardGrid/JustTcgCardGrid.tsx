import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import {
  fetchJustTcgBiggestGainers,
  fetchJustTcgBiggestLosers,
  type JustTcgMovementResult,
  type JustTcgMovementPeriod,
} from "../../services/justTcgFetchesApi";
import { GridView } from "../gridView/GridView";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";
import { Swimlane } from "../swimlane/Swimlane";
import "./JustTcgCardGrid.scss";

type JustTcgCardGridProps = {
  layout?: "grid" | "swimlane";
  period?: JustTcgMovementPeriod;
  type: "biggestGainers" | "biggestLosers";
};

const periodLabels: Record<JustTcgMovementPeriod, string> = {
  "24h": "24-hour change",
  "7d": "7-day change",
  "30d": "30-day change",
};

const DISPLAY_LIMIT = 20;

const typeLabels: Record<JustTcgCardGridProps["type"], string> = {
  biggestGainers: "Weekly Gainers",
  biggestLosers: "Weekly Losers",
};

function CardLayout({
  children,
  layout,
}: {
  children: ReactNode;
  layout: "grid" | "swimlane";
}) {
  if (layout === "swimlane") {
    return <Swimlane size="card">{children}</Swimlane>;
  }

  return <GridView>{children}</GridView>;
}

export function JustTcgCardGrid({
  layout = "grid",
  period = "7d",
  type,
}: JustTcgCardGridProps) {
  const titleId = useId();
  const [cards, setCards] = useState<JustTcgMovementResult[]>([]);
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
            : await fetchJustTcgBiggestLosers(controller.signal, period);

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
    <section className="justtcg-card-grid" aria-labelledby={titleId}>
      <header className="justtcg-card-grid__header">
        <h2 id={titleId}>{typeLabels[type]}</h2>
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
