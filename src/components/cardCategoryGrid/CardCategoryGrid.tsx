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
  collapsible?: boolean;
  controls?: ReactNode;
  defaultCollapsed?: boolean;
  emptyMessage?: ReactNode;
  error?: ReactNode;
  footer?: ReactNode;
  items: CardCategoryGridItem[];
  loading?: boolean;
  revealOnScroll?: boolean;
  sorting?: boolean;
  subtitle?: ReactNode;
  title?: ReactNode;
};

export function CardCategoryGrid({
  collapsible = true,
  controls,
  defaultCollapsed = false,
  emptyMessage = "No cards are available in this category yet.",
  error,
  footer,
  items,
  loading = false,
  revealOnScroll = true,
  sorting = false,
  subtitle,
  title,
}: CardCategoryGridProps) {
  return (
    <section className="card-category-grid ui-card-grid-enter ui-render-fade">
      <GridView
        collapsible={collapsible}
        defaultCollapsed={defaultCollapsed}
        revealOnScroll={revealOnScroll}
        sorting={sorting}
        subtitle={subtitle}
        title={title}
      >
        {controls && (
          <div className="card-category-grid__controls">{controls}</div>
        )}
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
        ) : items.length === 0 && emptyMessage ? (
          <p className="card-category-grid__state">{emptyMessage}</p>
        ) : items.length > 0 ? (
          items.map(({ card, marketDisplay }) => (
            <PokemonCardView
              card={card}
              key={card.id}
              marketDisplay={marketDisplay}
            />
          ))
        ) : null}
        {footer && !loading && !error && (
          <div className="card-category-grid__footer">{footer}</div>
        )}
      </GridView>
    </section>
  );
}
