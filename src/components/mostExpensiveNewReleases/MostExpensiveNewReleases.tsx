import { useEffect, useState } from "react";
import type { PokemonCard } from "../../types/pokemon";
import { fetchMostExpensiveNewReleases } from "../../services/cardDiscoveryApi";
import { GridView } from "../gridView/GridView";
import { PokemonCardView } from "../pokemonCardView/PokemonCardView";
import "./MostExpensiveNewReleases.scss";

export function MostExpensiveNewReleases() {
  const [cards, setCards] = useState<PokemonCard[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    void fetchMostExpensiveNewReleases(controller.signal)
      .then(setCards)
      .catch(() => {
        if (!controller.signal.aborted) setCards([]);
      });

    return () => controller.abort();
  }, []);

  if (cards.length === 0) return null;

  return (
    <section className="most-expensive-new-releases ui-render-fade">
      <GridView
        subtitle="Cards released within the last 12 months"
        title="Expensive New Releases"
      >
        {cards.map((card) => (
          <PokemonCardView
            card={card}
            key={card.id}
            priceSource="tcgplayer"
            showPriceSourcePicker
          />
        ))}
      </GridView>
    </section>
  );
}
