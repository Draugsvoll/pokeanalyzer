import type { ReactNode } from "react";
import type { PokemonCard } from "../../types/pokemon";
import {
  PokemonCardView,
  type PokemonCardViewProps,
} from "../pokemonCardView/PokemonCardView";
import { GridView } from "../gridView/GridView";
import "./CardCategoryGrid.scss";

export type CardCategoryGridItem = {
  card: PokemonCard;
  marketDisplay?: PokemonCardViewProps["marketDisplay"];
};

type CardCategoryGridProps = {
  emptyMessage?: ReactNode;
  error?: ReactNode;
  items: CardCategoryGridItem[];
  loading?: boolean;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function CardCategoryGrid({
  emptyMessage = "No cards are available in this category yet.",
  error,
  items,
  loading = false,
  subtitle,
  title,
}: CardCategoryGridProps) {
  return (
    <section className="card-category-grid ui-card-grid-enter ui-render-fade">
      <GridView subtitle={subtitle} title={title}>
        {loading ? (
          <div
            aria-label="Loading card category"
            className="card-category-grid__state"
            role="status"
          >
            <span aria-hidden="true" className="app-loading-spinner" />
          </div>
        ) : error ? (
          <p className="card-category-grid__state card-category-grid__state--error">
            {error}
          </p>
        ) : items.length === 0 ? (
          <p className="card-category-grid__state">{emptyMessage}</p>
        ) : (
          items.map(({ card, marketDisplay }) => (
            <PokemonCardView
              card={card}
              key={card.id}
              marketDisplay={marketDisplay}
            />
          ))
        )}
      </GridView>
    </section>
  );
}
